import { describe, expect, it } from 'vitest'
import { BUILDINGS } from '@/content/buildings'
import {
  bulkCost,
  buildingRate,
  computeMods,
  currentTier,
  eraForWorld,
  maxAffordable,
  nextTier,
  ramp,
  unitCost,
} from '@/engine/formulas'
import { createGameState } from '@/engine/game'
import { buyBuilding } from '@/engine/world'

const mods = () => computeMods(createGameState(0, 12345))

describe('cost curves', () => {
  it('bulkCost equals the sum of successive unit costs', () => {
    const m = mods()
    const def = BUILDINGS['core-tap']

    let summed = 0
    for (let i = 0; i < 15; i++) summed += unitCost(def, 7 + i, m)

    expect(bulkCost(def, 7, 15, m)).toBeCloseTo(summed, 6)
  })

  it('bulkCost of zero units is free', () => {
    expect(bulkCost(BUILDINGS['generator'], 3, 0, mods())).toBe(0)
  })

  it('maxAffordable is the exact inverse of bulkCost', () => {
    const m = mods()
    const def = BUILDINGS['thermal-vent']
    const owned = 11

    for (const budget of [0, 50, 5_000, 1e6, 1e12]) {
      const qty = maxAffordable(def, owned, budget, m)
      expect(bulkCost(def, owned, qty, m)).toBeLessThanOrEqual(budget + 1e-6)
      // One more must not fit, which is what makes it "max".
      expect(bulkCost(def, owned, qty + 1, m)).toBeGreaterThan(budget)
    }
  })

  it('never claims anything is affordable with no budget', () => {
    expect(maxAffordable(BUILDINGS['foundry'], 0, 0, mods())).toBe(0)
    expect(maxAffordable(BUILDINGS['foundry'], 0, -5, mods())).toBe(0)
  })
})

describe('building tiers', () => {
  it('promotes at the declared thresholds and keeps the owned count', () => {
    const state = createGameState(0, 999)
    const m = computeMods(state)
    const def = BUILDINGS['core-tap']
    const promotion = def.tiers[1]

    state.active.resources.energy = 1e12
    buyBuilding(state.active, 'core-tap', 'max', m)

    const count = state.active.buildings['core-tap'].count
    expect(count).toBeGreaterThanOrEqual(promotion.at)
    expect(currentTier(def, count).name).not.toBe(def.tiers[0].name)
    expect(currentTier(def, promotion.at - 1).name).toBe(def.tiers[0].name)
    expect(currentTier(def, promotion.at).name).toBe(promotion.name)
  })

  it('a promotion multiplies output without changing the count', () => {
    const m = mods()
    const def = BUILDINGS['generator']
    const at = def.tiers[1].at

    const before = buildingRate(def, at - 1, m) / (at - 1)
    const after = buildingRate(def, at, m) / at

    expect(after / before).toBeCloseTo(def.tiers[1].mult, 5)
  })

  it('reports no next tier once fully evolved', () => {
    const def = BUILDINGS['smelter']
    const last = def.tiers[def.tiers.length - 1]
    expect(nextTier(def, last.at)).toBeNull()
  })

  it('tier thresholds are strictly ascending and start at zero', () => {
    for (const def of Object.values(BUILDINGS)) {
      expect(def.tiers[0].at).toBe(0)
      for (let i = 1; i < def.tiers.length; i++) {
        expect(def.tiers[i].at).toBeGreaterThan(def.tiers[i - 1].at)
        expect(def.tiers[i].mult).toBeGreaterThan(def.tiers[i - 1].mult)
      }
    }
  })
})

describe('eras', () => {
  it('advances on lifetime totals and never regresses', () => {
    const state = createGameState(0, 7)
    const world = state.active

    expect(eraForWorld(world)).toBe('dead-core')

    world.stats.lifetime.energy = 5_000
    world.era = eraForWorld(world)
    expect(world.era).toBe('first-matter')

    // Spending everything must not demote the world.
    world.resources.energy = 0
    expect(eraForWorld(world)).toBe('first-matter')

    world.stats.lifetime.matter = 250_000
    expect(eraForWorld(world)).toBe('machines')
  })
})

describe('ramp', () => {
  it('clamps outside its range and is monotonic inside it', () => {
    expect(ramp(10, 100, 10_000)).toBe(0)
    expect(ramp(100, 100, 10_000)).toBe(0)
    expect(ramp(1e9, 100, 10_000)).toBe(1)
    expect(ramp(1_000, 100, 10_000)).toBeCloseTo(0.5, 6)
    expect(ramp(500, 100, 10_000)).toBeLessThan(ramp(5_000, 100, 10_000))
  })
})
