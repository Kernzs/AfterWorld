import { BUILDINGS, BUILDING_TICK_ORDER } from '@/content/buildings'
import { RESOURCE_IDS } from '@/content/resources'
import { UPGRADES_BY_ID } from '@/content/upgrades'
import { BASE_ORIENTATIONS } from '@/content/orientations'
import {
  bulkCost,
  buildingRate,
  clamp01,
  eraForWorld,
  isUnlocked,
  maxAffordable,
  type Mods,
} from './formulas'
import type {
  BuildingId,
  BuildingState,
  ResourceId,
  UpgradeId,
  World,
} from './types'

export type BuyAmount = 1 | 10 | 'max'

export function zeroResources(): Record<ResourceId, number> {
  const r = {} as Record<ResourceId, number>
  for (const id of RESOURCE_IDS) r[id] = 0
  return r
}

function freshBuildings(): Record<BuildingId, BuildingState> {
  const b = {} as Record<BuildingId, BuildingState>
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    b[id] = { count: 0, efficiency: 1 }
  }
  return b
}

export function createWorld(
  seed: number,
  index: number,
  now: number,
  startingEnergy = 0,
): World {
  const resources = zeroResources()
  resources.energy = startingEnergy

  const lifetime = zeroResources()
  lifetime.energy = startingEnergy

  return {
    id: `w${index}-${seed.toString(36)}`,
    seed,
    index,
    era: 'dead-core',
    resources,
    buildings: freshBuildings(),
    upgrades: [],
    stats: { lifetime, startedAt: now, elapsed: 0 },
    eventChoices: {},
    pendingEvent: null,
    eventMods: { global: 1, perResource: {}, profile: 1 },
    orientationsUnlocked: [...BASE_ORIENTATIONS],
    orientationsLocked: [],
  }
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface TickResult {
  /** Net change applied to the world's stock this tick. */
  net: Record<ResourceId, number>
  /** Gross production only, ignoring consumption. Drives lifetime totals. */
  gross: Record<ResourceId, number>
}

/**
 * The largest share of a resource's throughput that converters may take.
 *
 * Without this cap the game deadlocks, and not hypothetically: assemblers
 * consume matter, drills are *bought* with matter, and once assembler demand
 * exceeds matter production the stockpile can never grow again — so the player
 * can never afford the drills that would break the shortage. There is no way
 * out from inside the game, because buildings cannot be sold.
 *
 * Capping demand at a share of production guarantees the remaining 20% always
 * accumulates, which keeps every bottleneck escapable by construction rather
 * than by careful tuning of numbers that will drift.
 */
const MAX_THROUGHPUT_SHARE = 0.8

/**
 * Advances the active world by `dt` seconds.
 *
 * Buildings that consume inputs run at partial efficiency when the input is
 * short, rather than stalling outright — a half-fed chain still produces half.
 * Efficiency is stored per building so the UI can show *why* output dropped.
 *
 * Demand is met from this tick's production, never from the stockpile. That
 * relies on BUILDING_TICK_ORDER listing every producer of a resource before any
 * of its consumers; `tick order feeds consumers from complete production` in
 * the simulation tests holds that invariant in place.
 */
export function tickWorld(world: World, dt: number, mods: Mods): TickResult {
  const net = zeroResources()
  const gross = zeroResources()
  const consumed = zeroResources()

  for (const id of BUILDING_TICK_ORDER) {
    const def = BUILDINGS[id]
    const state = world.buildings[id]

    if (state.count <= 0) {
      state.efficiency = 1
      continue
    }

    let efficiency = 1
    if (def.consumes) {
      for (const key of Object.keys(def.consumes) as ResourceId[]) {
        const per = def.consumes[key] ?? 0
        const demand = state.count * per * dt
        if (demand <= 0) continue
        const budget = gross[key] * MAX_THROUGHPUT_SHARE - consumed[key]
        efficiency = Math.min(efficiency, budget / demand)
      }
      efficiency = clamp01(efficiency)

      for (const key of Object.keys(def.consumes) as ResourceId[]) {
        const per = def.consumes[key] ?? 0
        const used = state.count * per * dt * efficiency
        consumed[key] += used
        net[key] -= used
      }
    }

    state.efficiency = efficiency

    const produced = buildingRate(def, state.count, mods) * dt * efficiency
    net[def.produces] += produced
    gross[def.produces] += produced
  }

  for (const id of RESOURCE_IDS) {
    world.resources[id] += net[id]
    // Floating-point drift on a fully-consumed input can leave a tiny negative.
    if (world.resources[id] < 0) world.resources[id] = 0
    world.stats.lifetime[id] += gross[id]
  }

  world.stats.elapsed += dt
  world.era = eraForWorld(world)

  return { net, gross }
}

/** Per-second gross output of one resource, at current efficiencies. */
export function resourceRate(world: World, resource: ResourceId, mods: Mods): number {
  let total = 0
  for (const id of BUILDING_TICK_ORDER) {
    const def = BUILDINGS[id]
    if (def.produces !== resource) continue
    const state = world.buildings[id]
    total += buildingRate(def, state.count, mods) * state.efficiency
  }
  return total
}

/**
 * Per-second consumption of one resource. Unlike production, demand is not
 * scaled by multipliers — an upgraded drill produces more from the same intake,
 * which is the whole point of upgrading it.
 */
export function resourceDrain(world: World, resource: ResourceId): number {
  let total = 0
  for (const id of BUILDING_TICK_ORDER) {
    const def = BUILDINGS[id]
    const per = def.consumes?.[resource]
    if (!per) continue
    const state = world.buildings[id]
    total += state.count * per * state.efficiency
  }
  return total
}

/** Net per-second change a player sees on the resource bar. */
export function resourceNetRate(world: World, resource: ResourceId, mods: Mods): number {
  return resourceRate(world, resource, mods) - resourceDrain(world, resource)
}

/* ------------------------------------------------------------------ */
/* Player actions                                                      */
/* ------------------------------------------------------------------ */

/** Manual core pulse. Bootstraps the first minute, then fades into irrelevance. */
export function pulse(world: World, mods: Mods): number {
  const gain = 1 * mods.global
  world.resources.energy += gain
  world.stats.lifetime.energy += gain
  world.era = eraForWorld(world)
  return gain
}

export function resolveBuyQuantity(
  world: World,
  id: BuildingId,
  amount: BuyAmount,
  mods: Mods,
): number {
  const def = BUILDINGS[id]
  const owned = world.buildings[id].count
  const budget = world.resources[def.cost.resource]
  if (amount === 'max') return maxAffordable(def, owned, budget, mods)
  const affordable = maxAffordable(def, owned, budget, mods)
  return Math.min(amount, affordable)
}

export function buyBuilding(
  world: World,
  id: BuildingId,
  amount: BuyAmount,
  mods: Mods,
): number {
  const def = BUILDINGS[id]
  if (!isUnlocked(def.unlock, world)) return 0

  const qty = resolveBuyQuantity(world, id, amount, mods)
  if (qty <= 0) return 0

  const owned = world.buildings[id].count
  const cost = bulkCost(def, owned, qty, mods)
  if (cost > world.resources[def.cost.resource]) return 0

  world.resources[def.cost.resource] -= cost
  world.buildings[id].count += qty
  return qty
}

export function canAffordUpgrade(world: World, id: UpgradeId): boolean {
  const def = UPGRADES_BY_ID[id]
  if (!def) return false
  for (const key of Object.keys(def.cost) as ResourceId[]) {
    if (world.resources[key] < (def.cost[key] ?? 0)) return false
  }
  return true
}

export function buyUpgrade(world: World, id: UpgradeId): boolean {
  const def = UPGRADES_BY_ID[id]
  if (!def) return false
  if (world.upgrades.includes(id)) return false
  if (!isUnlocked(def.unlock, world)) return false
  if (!canAffordUpgrade(world, id)) return false

  for (const key of Object.keys(def.cost) as ResourceId[]) {
    world.resources[key] -= def.cost[key] ?? 0
  }
  world.upgrades.push(id)
  return true
}

/** Buildings the player is allowed to see, in display order. */
export function visibleBuildings(world: World): BuildingId[] {
  return (Object.keys(BUILDINGS) as BuildingId[]).filter((id) =>
    isUnlocked(BUILDINGS[id].unlock, world),
  )
}
