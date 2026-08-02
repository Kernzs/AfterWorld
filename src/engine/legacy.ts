import { ORIENTATIONS, investCost, investMult } from '@/content/orientations'
import {
  deriveChrononBase,
  deriveVisual,
  legacyChrononRate,
  type Mods,
} from './formulas'
import { createWorld, resourceRate } from './world'
import type {
  GameState,
  LegacyWorld,
  OrientationId,
  ResourceId,
  World,
} from './types'

/**
 * The output a world is producing at the instant it fractures. This snapshot is
 * the *entire* representation of the timeline from here on: it is never
 * re-simulated, so ticking it costs one multiply instead of walking nine
 * buildings. That is what lets the multiverse hold dozens of worlds.
 */
export function buildProfile(world: World, mods: Mods): Partial<Record<ResourceId, number>> {
  return {
    energy: resourceRate(world, 'energy', mods),
    matter: resourceRate(world, 'matter', mods),
    alloy: resourceRate(world, 'alloy', mods),
  }
}

export interface FracturePreview {
  profile: Partial<Record<ResourceId, number>>
  chrononBase: number
  /** Chronons per second this world would add right now, at invest level 0. */
  chrononRate: number
}

export function previewFracture(
  state: GameState,
  mods: Mods,
  orientation: OrientationId,
): FracturePreview {
  const world = state.active
  const profile = buildProfile(world, mods)
  const chrononBase = deriveChrononBase(profile, orientation, world.eventMods.profile)
  return {
    profile,
    chrononBase,
    chrononRate: chrononBase * mods.chrononMult,
  }
}

/** Orientations the player may actually pick, given this timeline's choices. */
export function availableOrientations(world: World): OrientationId[] {
  const set = new Set<OrientationId>(world.orientationsUnlocked)
  for (const locked of world.orientationsLocked) set.delete(locked)
  return (Object.keys(ORIENTATIONS) as OrientationId[]).filter((id) => set.has(id))
}

/**
 * Freezes the active world into a legacy timeline and starts a fresh one.
 * Mutates `state` and returns the newly frozen world.
 */
export function fracture(
  state: GameState,
  orientation: OrientationId,
  mods: Mods,
  now: number,
): LegacyWorld {
  const world = state.active
  const profile = buildProfile(world, mods)

  const visual = deriveVisual(world)
  visual.orientation = orientation
  visual.instability = 1

  const legacy: LegacyWorld = {
    id: world.id,
    seed: world.seed,
    index: world.index,
    name: `Timeline ${world.index} — ${ORIENTATIONS[orientation].name}`,
    orientation,
    era: world.era,
    profile,
    chrononBase: deriveChrononBase(profile, orientation, world.eventMods.profile),
    investLevel: 0,
    visual,
    fracturedAt: now,
    eventChoices: { ...world.eventChoices },
  }

  state.legacies.push(legacy)
  state.meta.fractures += 1

  const index = state.meta.nextWorldIndex
  const seed = state.meta.nextSeed
  state.meta.nextWorldIndex = index + 1
  state.meta.nextSeed = nextSeed(seed)

  // A fresh timeline should not begin with the click ritual again once you
  // have done it before. Scale the handout with how many worlds you have made.
  const startingEnergy = 25 * (1 + state.meta.fractures)
  state.active = createWorld(seed, index, now, startingEnergy)

  return legacy
}

/** Deterministic seed succession, so a save's future worlds are reproducible. */
export function nextSeed(seed: number): number {
  let x = seed >>> 0
  x ^= x << 13
  x >>>= 0
  x ^= x >> 17
  x ^= x << 5
  x >>>= 0
  return x || 1
}

/* ------------------------------------------------------------------ */
/* Ticking and investing                                               */
/* ------------------------------------------------------------------ */

/** Advances every frozen timeline. O(1) per world — no re-simulation. */
export function tickLegacies(state: GameState, dt: number, mods: Mods): number {
  let gained = 0
  for (const legacy of state.legacies) {
    gained += legacyChrononRate(legacy, mods) * dt
  }
  if (gained > 0) {
    state.meta.chronon += gained
    state.meta.lifetimeChronon += gained
  }
  return gained
}

export function canInvest(state: GameState, legacyId: string): boolean {
  const legacy = state.legacies.find((l) => l.id === legacyId)
  if (!legacy) return false
  return state.meta.chronon >= investCost(legacy.investLevel)
}

/** Spends chronons to deepen a frozen timeline: more output, stronger boon. */
export function investInLegacy(state: GameState, legacyId: string): boolean {
  const legacy = state.legacies.find((l) => l.id === legacyId)
  if (!legacy) return false

  const cost = investCost(legacy.investLevel)
  if (state.meta.chronon < cost) return false

  state.meta.chronon -= cost
  legacy.investLevel += 1
  return true
}

export { investCost, investMult }
