/**
 * A simulated player, used to keep pacing claims honest.
 *
 * Purchases are scored by *measuring* what they do: the candidate is bought in
 * a throwaway copy of the world, that copy is ticked, and the resulting output
 * is compared against leaving things alone.
 *
 * Scoring converters by a fixed exchange rate instead does not work. A smelter
 * turns roughly 132 energy-equivalent of input into 110 of alloy, so any
 * price-list heuristic calls the entire refining chain a mistake and the run
 * stalls in era 2 forever. Measuring catches what a price list cannot: alloy
 * gates era 3 and the fracture, so producing it is worth more than the matter
 * it costs.
 */

import { BUILDINGS, BUILDING_ORDER } from '@/content/buildings'
import { UPGRADES } from '@/content/upgrades'
import { EVENTS_BY_ID } from '@/content/events'
import { investCost } from '@/content/orientations'
import { canFracture, computeMods, isUnlocked, unitCost, type Mods } from '@/engine/formulas'
import { tickWorldAndLegacies } from '@/engine/game'
import { resolveEvent } from '@/engine/events'
import { fracture, investInLegacy } from '@/engine/legacy'
import { convergenceStatus } from '@/engine/convergence'
import {
  buyBuilding,
  buyUpgrade,
  canAffordUpgrade,
  pulse,
  resourceRate,
  tickWorld,
} from '@/engine/world'
import type {
  BuildingId,
  GameState,
  OrientationId,
  ResourceId,
  World,
} from '@/engine/types'

const COST_WEIGHT: Record<ResourceId, number> = {
  energy: 1,
  matter: 30,
  alloy: 1_600,
  chronon: 0,
}

const MAX_PURCHASES_PER_SECOND = 10
const PROBE_TICKS = 5
const PROBE_DT = 0.2
const CLICK_SECONDS = 45
const CLICKS_PER_SECOND = 3

/**
 * Alloy dominates once any exists, since it gates era 3 and the fracture. The
 * small matter and energy terms only break ties before that.
 */
function goalValue(world: World, mods: Mods): number {
  return (
    resourceRate(world, 'alloy', mods) +
    resourceRate(world, 'matter', mods) * 1e-3 +
    resourceRate(world, 'energy', mods) * 1e-7
  )
}

/** A copy deep enough to tick without touching the real world. */
function probeCopy(world: World): World {
  const buildings = {} as World['buildings']
  for (const id of Object.keys(world.buildings) as BuildingId[]) {
    buildings[id] = { ...world.buildings[id] }
  }
  return {
    ...world,
    resources: { ...world.resources },
    buildings,
    stats: { ...world.stats, lifetime: { ...world.stats.lifetime } },
  }
}

function settledGoal(world: World, mods: Mods): number {
  const probe = probeCopy(world)
  for (let i = 0; i < PROBE_TICKS; i++) tickWorld(probe, PROBE_DT, mods)
  return goalValue(probe, mods)
}

function marginalScore(world: World, id: BuildingId, mods: Mods, baseline: number): number {
  const def = BUILDINGS[id]
  const owned = world.buildings[id].count
  const price = unitCost(def, owned, mods)

  const probe = probeCopy(world)
  probe.buildings[id].count += 1
  probe.resources[def.cost.resource] = Math.max(0, probe.resources[def.cost.resource] - price)
  for (let i = 0; i < PROBE_TICKS; i++) tickWorld(probe, PROBE_DT, mods)

  const cost = price * COST_WEIGHT[def.cost.resource]
  if (cost <= 0) return 0

  return (goalValue(probe, mods) - baseline) / cost
}

/** Returns true when something was bought, so the caller can recompute mods. */
export function autoBuy(state: GameState, mods: Mods): boolean {
  const world = state.active
  let changed = false

  for (const upgrade of UPGRADES) {
    if (world.upgrades.includes(upgrade.id)) continue
    if (!isUnlocked(upgrade.unlock, world)) continue
    if (!canAffordUpgrade(world, upgrade.id)) continue
    if (buyUpgrade(world, upgrade.id)) changed = true
  }

  for (let i = 0; i < MAX_PURCHASES_PER_SECOND; i++) {
    const baseline = settledGoal(world, mods)
    let best: BuildingId | null = null
    let bestScore = 0

    for (const id of BUILDING_ORDER) {
      const def = BUILDINGS[id]
      if (!isUnlocked(def.unlock, world)) continue
      if (unitCost(def, world.buildings[id].count, mods) > world.resources[def.cost.resource])
        continue

      const score = marginalScore(world, id, mods, baseline)
      if (score > bestScore) {
        bestScore = score
        best = id
      }
    }

    if (!best) break
    if (buyBuilding(world, best, 1, mods) === 0) break
    changed = true
  }

  return changed
}

/** Clicking only matters before anything is automated. */
export function autoPulse(state: GameState, mods: Mods, second: number): void {
  if (second >= CLICK_SECONDS) return
  for (let i = 0; i < CLICKS_PER_SECOND; i++) pulse(state.active, mods)
}

export function resolvePending(state: GameState, choiceId: string): boolean {
  const pending = state.active.pendingEvent
  if (!pending || !EVENTS_BY_ID[pending]) return false
  return resolveEvent(state.active, pending, choiceId)
}

/** Deepens whichever frozen timeline is currently shallowest and affordable. */
export function autoInvest(state: GameState): boolean {
  const shallowestFirst = [...state.legacies].sort((a, b) => a.investLevel - b.investLevel)
  for (const legacy of shallowestFirst) {
    if (state.meta.chronon >= investCost(legacy.investLevel)) {
      return investInLegacy(state, legacy.id)
    }
  }
  return false
}

export interface RunResult {
  seconds: number
  reachedFracture: boolean
}

/** Plays one timeline until it can fracture, or gives up after `capSeconds`. */
export function playUntilFracture(
  state: GameState,
  capSeconds: number,
  eventChoice: string,
): RunResult {
  let mods = computeMods(state)

  for (let seconds = 0; seconds < capSeconds; seconds++) {
    autoPulse(state, mods, seconds)
    if (autoBuy(state, mods)) mods = computeMods(state)

    tickWorldAndLegacies(state, 1, mods)

    if (resolvePending(state, eventChoice)) mods = computeMods(state)

    if (canFracture(state.active)) return { seconds: seconds + 1, reachedFracture: true }
  }

  return { seconds: capSeconds, reachedFracture: false }
}

/**
 * The route the Convergence actually forces: four timelines, one per path, and
 * a different answer to the assemblers along the way — "Delete it" would close
 * both Synthetic and Mystic, so it can never appear here.
 */
export const CONVERGENCE_ROUTE: Array<{ event: string; orientation: OrientationId }> = [
  { event: 'exile', orientation: 'mystic' },
  { event: 'merge', orientation: 'synthetic' },
  { event: 'merge', orientation: 'industrial' },
  { event: 'merge', orientation: 'organic' },
]

export interface ArcResult {
  seconds: number
  converged: boolean
  /** Wall-clock seconds spent on each timeline, in order. */
  runs: number[]
  /** Seconds spent purely deepening once the four worlds existed. */
  deepeningSeconds: number
}

/** Plays the whole arc, first click to Convergence. */
export function playConvergenceArc(state: GameState, capSeconds: number): ArcResult {
  const runs: number[] = []
  let seconds = 0

  for (const step of CONVERGENCE_ROUTE) {
    const run = playUntilFracture(state, capSeconds - seconds, step.event)
    runs.push(run.seconds)
    seconds += run.seconds
    if (!run.reachedFracture) {
      return { seconds, converged: false, runs, deepeningSeconds: 0 }
    }
    fracture(state, step.orientation, computeMods(state), 0)
  }

  // Chronon income comes only from frozen timelines, so what the player does on
  // the fifth world does not change how fast the last depth levels arrive.
  let deepening = 0
  let mods = computeMods(state)
  while (seconds < capSeconds && !convergenceStatus(state).complete) {
    tickWorldAndLegacies(state, 1, mods)
    if (autoInvest(state)) mods = computeMods(state)
    seconds++
    deepening++
  }

  return {
    seconds,
    converged: convergenceStatus(state).complete,
    runs,
    deepeningSeconds: deepening,
  }
}
