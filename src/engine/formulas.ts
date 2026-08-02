/**
 * All arithmetic lives here and in world.ts. Native `number` is enough for the
 * ceiling this slice reaches (~1e40); if later layers push past 1e308, swapping
 * in a big-number library is a change contained to these two files plus
 * lib/format.ts.
 */

import { BUILDINGS } from '@/content/buildings'
import { ERAS, ERA_ORDER, FRACTURE_REQUIREMENT } from '@/content/eras'
import { ORIENTATIONS, boonStrength, investMult } from '@/content/orientations'
import { UPGRADES_BY_ID } from '@/content/upgrades'
import { RESOURCE_IDS } from '@/content/resources'
import type {
  BuildingDef,
  BuildingId,
  BuildingTier,
  EraId,
  GameState,
  LegacyWorld,
  PlanetVisualState,
  ResourceId,
  Unlock,
  World,
} from './types'

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const clamp01 = (v: number) => clamp(v, 0, 1)

/** Log-scaled 0..1 ramp between two magnitudes. Undefined below `start`. */
export function ramp(value: number, start: number, end: number): number {
  if (value <= start) return 0
  if (value >= end) return 1
  return clamp01(Math.log(value / start) / Math.log(end / start))
}

/* ------------------------------------------------------------------ */
/* Aggregated multipliers                                              */
/* ------------------------------------------------------------------ */

export interface Mods {
  global: number
  perResource: Record<ResourceId, number>
  perBuilding: Record<BuildingId, number>
  /** Multiplier on purchase cost, per building. Lower is better. */
  costFactor: Record<BuildingId, number>
  /** Applies to every legacy world's chronon output. */
  chrononMult: number
}

function emptyMods(): Mods {
  const perResource = {} as Record<ResourceId, number>
  for (const r of RESOURCE_IDS) perResource[r] = 1

  const perBuilding = {} as Record<BuildingId, number>
  const costFactor = {} as Record<BuildingId, number>
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    perBuilding[id] = 1
    costFactor[id] = 1
  }

  return { global: 1, perResource, perBuilding, costFactor, chrononMult: 1 }
}

/**
 * Recomputed whenever something structural changes (a purchase, a fracture, an
 * event resolution) rather than every tick — nothing here varies with time.
 */
export function computeMods(state: GameState): Mods {
  const mods = emptyMods()
  const world = state.active

  for (const upgradeId of world.upgrades) {
    const def = UPGRADES_BY_ID[upgradeId]
    if (!def) continue
    for (const fx of def.effects) {
      switch (fx.kind) {
        case 'globalMult':
          mods.global *= fx.mult
          break
        case 'resourceMult':
          mods.perResource[fx.resource] *= fx.mult
          break
        case 'buildingMult':
          mods.perBuilding[fx.building] *= fx.mult
          break
        case 'costReduction':
          mods.costFactor[fx.building] *= fx.factor
          break
      }
    }
  }

  mods.global *= world.eventMods.global
  for (const r of RESOURCE_IDS) {
    mods.perResource[r] *= world.eventMods.perResource[r] ?? 1
  }

  // Every fracture leaves the next timeline permanently stronger.
  mods.global *= 1 + 0.25 * state.meta.fractures

  // Boons from frozen timelines. This is what makes the collection matter.
  let costReduction = 1
  for (const legacy of state.legacies) {
    const orientation = ORIENTATIONS[legacy.orientation]
    const boon = orientation.boon
    const strength = boonStrength(boon.perLevel, legacy.investLevel)
    switch (boon.kind) {
      case 'resourceMult':
        mods.perResource[boon.resource] *= 1 + strength
        break
      case 'globalMult':
        mods.global *= 1 + strength
        break
      case 'costReduction':
        costReduction *= 1 - Math.min(strength, 0.5)
        break
      case 'chrononMult':
        mods.chrononMult *= 1 + strength
        break
    }
  }

  // A floor on cost reduction: stacking Synthetic worlds should stay strong
  // without ever making buildings effectively free.
  costReduction = Math.max(costReduction, 0.25)
  if (costReduction < 1) {
    for (const id of Object.keys(mods.costFactor) as BuildingId[]) {
      mods.costFactor[id] *= costReduction
    }
  }

  return mods
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export function tierIndexFor(def: BuildingDef, count: number): number {
  let idx = 0
  for (let i = 0; i < def.tiers.length; i++) {
    if (count >= def.tiers[i].at) idx = i
    else break
  }
  return idx
}

export function currentTier(def: BuildingDef, count: number): BuildingTier {
  return def.tiers[tierIndexFor(def, count)]
}

/** The next promotion, or null once the building is fully evolved. */
export function nextTier(def: BuildingDef, count: number): BuildingTier | null {
  const idx = tierIndexFor(def, count)
  return idx + 1 < def.tiers.length ? def.tiers[idx + 1] : null
}

/** Cost of the single next unit. */
export function unitCost(def: BuildingDef, owned: number, mods: Mods): number {
  return def.cost.base * Math.pow(def.cost.growth, owned) * mods.costFactor[def.id]
}

/** Cost of buying `qty` more, as a closed-form geometric sum. */
export function bulkCost(def: BuildingDef, owned: number, qty: number, mods: Mods): number {
  if (qty <= 0) return 0
  const g = def.cost.growth
  const first = def.cost.base * Math.pow(g, owned) * mods.costFactor[def.id]
  return first * ((Math.pow(g, qty) - 1) / (g - 1))
}

/** How many more units `budget` can buy. Inverse of `bulkCost`. */
export function maxAffordable(
  def: BuildingDef,
  owned: number,
  budget: number,
  mods: Mods,
): number {
  if (budget <= 0) return 0
  const g = def.cost.growth
  const first = def.cost.base * Math.pow(g, owned) * mods.costFactor[def.id]
  if (!Number.isFinite(first) || first <= 0) return 0
  const ratio = 1 + (budget * (g - 1)) / first
  if (!Number.isFinite(ratio) || ratio < 1) return 0
  return Math.max(0, Math.floor(Math.log(ratio) / Math.log(g)))
}

/**
 * Gross output per second, ignoring whether inputs are actually available.
 * Starvation is applied during the tick, not here.
 */
export function buildingRate(def: BuildingDef, count: number, mods: Mods): number {
  if (count <= 0) return 0
  return (
    count *
    def.base *
    currentTier(def, count).mult *
    mods.perBuilding[def.id] *
    mods.perResource[def.produces] *
    mods.global
  )
}

/* ------------------------------------------------------------------ */
/* Unlocks and eras                                                    */
/* ------------------------------------------------------------------ */

export function eraIndex(era: EraId): number {
  return ERAS[era].index
}

export function isUnlocked(unlock: Unlock, world: World): boolean {
  switch (unlock.kind) {
    case 'always':
      return true
    case 'era':
      return eraIndex(world.era) >= eraIndex(unlock.era)
    case 'lifetime':
      return world.stats.lifetime[unlock.resource] >= unlock.amount
    case 'buildingCount':
      return world.buildings[unlock.building].count >= unlock.count
    case 'upgrade':
      return world.upgrades.includes(unlock.upgrade)
    case 'all':
      return unlock.of.every((u) => isUnlocked(u, world))
  }
}

/** The era a world's lifetime totals entitle it to. Never moves backwards. */
export function eraForWorld(world: World): EraId {
  let result: EraId = 'dead-core'
  for (const id of ERA_ORDER) {
    const entry = ERAS[id].entry
    if (entry === null) {
      result = id
      continue
    }
    if (world.stats.lifetime[entry.resource] >= entry.amount) result = id
    else break
  }
  return eraIndex(result) > eraIndex(world.era) ? result : world.era
}

export function canFracture(world: World): boolean {
  return world.stats.lifetime[FRACTURE_REQUIREMENT.resource] >= FRACTURE_REQUIREMENT.amount
}

/** 0..1 progress toward the fracture threshold, for the UI and the rift FX. */
export function fractureProgress(world: World): number {
  return clamp01(
    world.stats.lifetime[FRACTURE_REQUIREMENT.resource] / FRACTURE_REQUIREMENT.amount,
  )
}

/* ------------------------------------------------------------------ */
/* Legacy timelines                                                    */
/* ------------------------------------------------------------------ */

/**
 * Condenses a world's final output into a single scalar so chronon yield can
 * be derived from it. Weights reflect roughly how much energy each resource
 * costs to make, so a matter-heavy and an energy-heavy world of equal effort
 * are valued alike.
 */
export function energyEquivalent(profile: Partial<Record<ResourceId, number>>): number {
  return (
    (profile.energy ?? 0) + (profile.matter ?? 0) * 50 + (profile.alloy ?? 0) * 2_000
  )
}

/**
 * Strongly sublinear in the world's size: a timeline fractured ten times deeper
 * is worth more, but not ten times more. Without this the newest world would
 * drown every earlier one and the collection would stop mattering.
 *
 * `profileMult` — the reward from event choices that trade present power for a
 * richer frozen timeline — deliberately sits *outside* the exponent. Inside it,
 * the same compression that keeps worlds comparable also flattened a promised
 * "markedly richer timeline" into a couple of percent, which made choosing it
 * strictly worse than the option that simply raised production instead. Outside
 * the exponent it means what the prose says: ×1.35 is 35% more chronons.
 */
export function deriveChrononBase(
  profile: Partial<Record<ResourceId, number>>,
  orientation: keyof typeof ORIENTATIONS,
  profileMult: number,
): number {
  const equivalent = energyEquivalent(profile)
  if (equivalent <= 0) return 0
  return (
    0.02 * Math.pow(equivalent, 0.28) * ORIENTATIONS[orientation].chrononMult * profileMult
  )
}

/** Chronons per second from one frozen timeline, with all multipliers applied. */
export function legacyChrononRate(legacy: LegacyWorld, mods: Mods): number {
  return legacy.chrononBase * investMult(legacy.investLevel) * mods.chrononMult
}

export function totalChrononRate(state: GameState, mods: Mods): number {
  let total = 0
  for (const legacy of state.legacies) total += legacyChrononRate(legacy, mods)
  return total
}

/* ------------------------------------------------------------------ */
/* Visual derivation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Maps world progress onto the renderer's inputs. Kept here rather than in
 * render/ so the fracture can freeze a legacy's appearance with one call.
 */
export function deriveVisual(world: World): PlanetVisualState {
  const life = world.stats.lifetime
  const era = world.era
  const idx = eraIndex(era)

  const terraform = ramp(life.energy, 500, 5e8)
  const ocean = idx >= 1 ? ramp(life.matter, 2_000, 5e7) : 0
  // Life follows water, but only once the world is warm enough to keep it.
  const biomass = idx >= 1 ? ocean * ramp(life.matter, 150_000, 2e8) : 0
  const civilization = idx >= 2 ? ramp(life.alloy, 5_000, 2e7) : 0
  const orbital = clamp01(world.buildings['orbital-collector'].count / 60)
  const instability = fractureProgress(world)

  return {
    seed: world.seed,
    era,
    terraform,
    ocean,
    biomass,
    civilization,
    orbital,
    instability,
    orientation: null,
  }
}
