import { RESOURCE_IDS } from '@/content/resources'
import { computeMods, type Mods } from './formulas'
import { checkEvents, resolveEvent } from './events'
import { converge } from './convergence'
import { fracture, investInLegacy, nextSeed, tickLegacies } from './legacy'
import {
  buyBuilding,
  buyUpgrade,
  createWorld,
  pulse,
  tickWorld,
  type BuyAmount,
} from './world'
import type {
  BuildingId,
  GameState,
  OfflineReport,
  OrientationId,
  PlanetVisualState,
  ResourceId,
  UpgradeId,
} from './types'

export const SAVE_VERSION = 1

/** Simulation runs at a fixed 20 Hz regardless of display refresh rate. */
export const TICK_MS = 50
const TICK_S = TICK_MS / 1000

/** Gaps longer than this are handled by coarse catch-up, not by 20 Hz ticks. */
const REALTIME_GAP_MS = 5_000

/** Coarse catch-up granularity. */
const CATCHUP_STEP_S = 1

/** Offline earnings stop accruing past this. */
export const OFFLINE_CAP_S = 8 * 3_600

/** How often the UI is told to re-render. The sim still runs at 20 Hz. */
const PUBLISH_INTERVAL_MS = 100

export function createGameState(now: number, seed?: number): GameState {
  const rootSeed = seed ?? ((Math.random() * 0xffffffff) >>> 0 || 1)
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeenAt: now,
    active: createWorld(rootSeed, 1, now, 0),
    legacies: [],
    meta: {
      chronon: 0,
      lifetimeChronon: 0,
      fractures: 0,
      nextWorldIndex: 2,
      nextSeed: nextSeed(rootSeed),
      convergedAt: null,
      endingSeen: false,
    },
  }
}

/**
 * Owns the simulation. Deliberately not a React store: the loop must not be
 * coupled to the render cycle, and the canvas reads this directly at 60 fps
 * without going through React at all.
 */
export class Game {
  state: GameState
  mods: Mods

  /** Bumped only every PUBLISH_INTERVAL_MS, or immediately on player action. */
  private version = 0
  private listeners = new Set<() => void>()

  private accumulatorMs = 0
  private lastFrameMs: number | null = null
  private sincePublishMs = 0

  /** Set once on load, cleared when the player dismisses the report. */
  offlineReport: OfflineReport | null = null

  /**
   * Set at the moment of fracture so the canvas can stage the rift. Holds the
   * outgoing world's appearance, because by the time this is read `active` is
   * already the new timeline. Cleared by the renderer once it has played out.
   */
  fractureTransition: { startedAt: number; from: PlanetVisualState } | null = null

  constructor(state: GameState) {
    this.state = state
    this.mods = computeMods(state)
  }

  /* ---------------- subscription ---------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  private publish(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }

  /** Recompute multipliers and force an immediate UI refresh. */
  private commit(): void {
    this.mods = computeMods(this.state)
    this.publish()
  }

  /* ---------------- simulation ---------------- */

  private step(dt: number): void {
    tickWorldAndLegacies(this.state, dt, this.mods)
  }

  /**
   * Runs however many fixed steps have come due. A long gap (backgrounded tab,
   * sleeping laptop) is handed to the coarse catch-up instead of being ground
   * through at 20 Hz, which would either freeze the frame or silently lose time.
   */
  runFrame(nowMs: number): void {
    if (this.lastFrameMs === null) {
      this.lastFrameMs = nowMs
      return
    }

    const elapsedMs = Math.max(0, nowMs - this.lastFrameMs)
    this.lastFrameMs = nowMs

    // A backgrounded tab receives no animation frames, so a long gap here is
    // the same situation as being closed: fast-forward it rather than grinding
    // it out at 20 Hz, which would either stall the frame or drop the time.
    if (elapsedMs > REALTIME_GAP_MS) {
      this.accumulatorMs = 0
      const report = this.catchUp(elapsedMs / 1000)
      this.mergeOfflineReport(report)
      this.state.lastSeenAt = Date.now()
      this.commit()
      return
    }

    this.accumulatorMs += elapsedMs
    const ticks = Math.floor(this.accumulatorMs / TICK_MS)
    if (ticks <= 0) return
    this.accumulatorMs -= ticks * TICK_MS

    for (let i = 0; i < ticks; i++) this.step(TICK_S)

    this.state.lastSeenAt = Date.now()

    this.sincePublishMs += elapsedMs
    if (this.sincePublishMs >= PUBLISH_INTERVAL_MS) {
      this.sincePublishMs = 0
      this.publish()
    }
  }

  /**
   * Fast-forwards `seconds` in coarse steps. Frozen timelines could be done in
   * closed form, but the active world's production chain has feedback (energy
   * feeds condensers feed smelters), so stepping it is the only honest way to
   * get the same answer the player would have gotten by watching.
   */
  catchUp(seconds: number): OfflineReport {
    const capped = seconds > OFFLINE_CAP_S
    const total = Math.min(Math.max(seconds, 0), OFFLINE_CAP_S)

    const before = snapshotTotals(this.state)

    let remaining = total
    while (remaining > 0) {
      const dt = Math.min(CATCHUP_STEP_S, remaining)
      this.step(dt)
      remaining -= dt
    }

    const after = snapshotTotals(this.state)

    const gains: Partial<Record<ResourceId, number>> = {}
    for (const id of RESOURCE_IDS) {
      if (id === 'chronon') continue
      const delta = after.resources[id] - before.resources[id]
      if (delta > 0) gains[id] = delta
    }

    return {
      seconds: total,
      gains,
      chronon: after.chronon - before.chronon,
      capped,
    }
  }

  private mergeOfflineReport(report: OfflineReport): void {
    if (report.seconds < 60) return
    const existing = this.offlineReport
    if (!existing) {
      this.offlineReport = report
      return
    }
    existing.seconds += report.seconds
    existing.chronon += report.chronon
    existing.capped = existing.capped || report.capped
    for (const id of RESOURCE_IDS) {
      const delta = report.gains[id]
      if (delta) existing.gains[id] = (existing.gains[id] ?? 0) + delta
    }
  }

  /** Applies time elapsed since the save was written. Call once, after load. */
  applyOfflineTime(nowMs: number): void {
    const elapsed = (nowMs - this.state.lastSeenAt) / 1000
    this.state.lastSeenAt = nowMs
    if (elapsed < 60) return
    this.mergeOfflineReport(this.catchUp(elapsed))
    this.commit()
  }

  dismissOfflineReport(): void {
    this.offlineReport = null
    this.publish()
  }

  /* ---------------- player actions ---------------- */

  pulse(): void {
    pulse(this.state.active, this.mods)
    checkEvents(this.state.active)
    this.publish()
  }

  buy(id: BuildingId, amount: BuyAmount): void {
    if (buyBuilding(this.state.active, id, amount, this.mods) > 0) {
      checkEvents(this.state.active)
      this.publish()
    }
  }

  buyUpgrade(id: UpgradeId): void {
    if (buyUpgrade(this.state.active, id)) this.commit()
  }

  resolveEvent(eventId: string, choiceId: string): void {
    if (resolveEvent(this.state.active, eventId, choiceId)) this.commit()
  }

  fracture(orientation: OrientationId): void {
    const legacy = fracture(this.state, orientation, this.mods, Date.now())
    this.fractureTransition = {
      // Same clock as requestAnimationFrame, so the renderer can compare directly.
      startedAt: typeof performance !== 'undefined' ? performance.now() : 0,
      from: legacy.visual,
    }
    this.commit()
  }

  /**
   * Recompute multipliers and repaint. For tools that mutate state directly
   * rather than going through an action — the dev panel is the only caller.
   */
  refresh(): void {
    this.commit()
  }

  invest(legacyId: string): void {
    if (investInLegacy(this.state, legacyId)) this.commit()
  }

  converge(): void {
    if (converge(this.state, Date.now())) this.commit()
  }

  acknowledgeEnding(): void {
    this.state.meta.endingSeen = true
    this.publish()
  }

  hardReset(): void {
    this.replaceState(createGameState(Date.now()))
  }

  replaceState(state: GameState): void {
    this.state = state
    this.offlineReport = null
    this.fractureTransition = null
    this.accumulatorMs = 0
    this.lastFrameMs = null
    this.commit()
  }
}

/**
 * One simulation step, in the order that matters: the active world first, then
 * the frozen timelines, then the event check so a purchase made this step can
 * raise its event immediately.
 *
 * Exported so tests can drive the sim without a Game instance — in particular
 * to check that N fine ticks and one coarse catch-up agree.
 */
export function tickWorldAndLegacies(state: GameState, dt: number, mods: Mods): void {
  tickWorld(state.active, dt, mods)
  tickLegacies(state, dt, mods)
  checkEvents(state.active)
}

function snapshotTotals(state: GameState): {
  resources: Record<ResourceId, number>
  chronon: number
} {
  const resources = {} as Record<ResourceId, number>
  for (const id of RESOURCE_IDS) resources[id] = state.active.resources[id]
  return { resources, chronon: state.meta.chronon }
}
