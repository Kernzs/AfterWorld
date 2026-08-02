import { describe, expect, it } from 'vitest'
import { ORIENTATIONS, investCost } from '@/content/orientations'
import {
  computeMods,
  energyEquivalent,
  legacyChrononRate,
  totalChrononRate,
} from '@/engine/formulas'
import { Game, createGameState, tickWorldAndLegacies } from '@/engine/game'
import {
  availableOrientations,
  fracture,
  investInLegacy,
  previewFracture,
} from '@/engine/legacy'
import { resolveEvent } from '@/engine/events'
import { resourceRate } from '@/engine/world'
import type { GameState } from '@/engine/types'

function seedProducingWorld(state: GameState): void {
  const world = state.active
  world.era = 'machines'
  world.stats.lifetime.energy = 1e8
  world.stats.lifetime.matter = 1e6
  world.stats.lifetime.alloy = 3e5
  world.resources.energy = 1e9
  world.resources.matter = 1e7
  world.resources.alloy = 1e6

  world.buildings['core-tap'].count = 120
  world.buildings['thermal-vent'].count = 90
  world.buildings['generator'].count = 60
  world.buildings['orbital-collector'].count = 20
  world.buildings['condenser'].count = 50
  world.buildings['drill'].count = 40
  world.buildings['smelter'].count = 30
  world.buildings['assembler'].count = 26
}

describe('fracture', () => {
  it('freezes a profile equal to the world final production', () => {
    const state = createGameState(0, 4242)
    seedProducingWorld(state)
    const mods = computeMods(state)

    // Settle efficiencies so the rates reflect a running world.
    tickWorldAndLegacies(state, 1, mods)

    const expected = {
      energy: resourceRate(state.active, 'energy', mods),
      matter: resourceRate(state.active, 'matter', mods),
      alloy: resourceRate(state.active, 'alloy', mods),
    }

    const legacy = fracture(state, 'industrial', mods, 0)

    expect(legacy.profile.energy).toBeCloseTo(expected.energy, 6)
    expect(legacy.profile.matter).toBeCloseTo(expected.matter, 6)
    expect(legacy.profile.alloy).toBeCloseTo(expected.alloy, 6)
    expect(legacy.chrononBase).toBeGreaterThan(0)
  })

  it('matches what the preview promised', () => {
    const state = createGameState(0, 77)
    seedProducingWorld(state)
    const mods = computeMods(state)
    tickWorldAndLegacies(state, 1, mods)

    const preview = previewFracture(state, mods, 'organic')
    const legacy = fracture(state, 'organic', mods, 0)

    expect(legacy.chrononBase).toBeCloseTo(preview.chrononBase, 8)
    expect(legacy.profile.matter).toBeCloseTo(preview.profile.matter ?? 0, 6)
  })

  it('starts a fresh timeline while keeping the old one', () => {
    const state = createGameState(0, 4242)
    seedProducingWorld(state)
    const mods = computeMods(state)

    const previousId = state.active.id
    fracture(state, 'industrial', mods, 0)

    expect(state.legacies).toHaveLength(1)
    expect(state.legacies[0].id).toBe(previousId)
    expect(state.active.id).not.toBe(previousId)
    expect(state.active.index).toBe(2)
    expect(state.active.era).toBe('dead-core')
    expect(state.meta.fractures).toBe(1)
    // Not the click ritual all over again.
    expect(state.active.resources.energy).toBeGreaterThan(0)
  })

  it('produces chronons without the old world being simulated again', () => {
    const state = createGameState(0, 4242)
    seedProducingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)

    const mods = computeMods(state)
    const expected = totalChrononRate(state, mods)
    expect(expected).toBeGreaterThan(0)

    const before = state.meta.chronon
    tickWorldAndLegacies(state, 10, mods)

    expect(state.meta.chronon - before).toBeCloseTo(expected * 10, 6)
  })

  it('values a stronger world more, but sublinearly', () => {
    const weak = createGameState(0, 1)
    seedProducingWorld(weak)
    const weakLegacy = fracture(weak, 'industrial', computeMods(weak), 0)

    const strong = createGameState(0, 1)
    seedProducingWorld(strong)
    for (const id of Object.keys(strong.active.buildings) as Array<
      keyof typeof strong.active.buildings
    >) {
      strong.active.buildings[id].count *= 4
    }
    const strongLegacy = fracture(strong, 'industrial', computeMods(strong), 0)

    expect(strongLegacy.chrononBase).toBeGreaterThan(weakLegacy.chrononBase)

    // A far bigger world is worth more, but nothing like proportionally —
    // otherwise the newest timeline drowns every earlier one and the whole
    // collection stops mattering.
    const outputRatio = energyEquivalent(strongLegacy.profile) / energyEquivalent(weakLegacy.profile)
    const chrononRatio = strongLegacy.chrononBase / weakLegacy.chrononBase

    expect(outputRatio).toBeGreaterThan(4)
    expect(chrononRatio).toBeLessThan(Math.sqrt(outputRatio))
  })
})

describe('orientations', () => {
  it('offers only the paths this timeline left open', () => {
    const state = createGameState(0, 9)
    expect(availableOrientations(state.active).sort()).toEqual(['industrial', 'organic'])

    resolveEvent(state.active, 'ai-independence', 'exile')
    expect(availableOrientations(state.active)).toContain('mystic')
    expect(availableOrientations(state.active)).not.toContain('synthetic')
  })

  it('closes paths when the network is destroyed', () => {
    const state = createGameState(0, 9)
    resolveEvent(state.active, 'ai-independence', 'delete')

    const available = availableOrientations(state.active)
    expect(available).not.toContain('synthetic')
    expect(available).not.toContain('mystic')
    expect(available).toContain('industrial')
  })

  it('applies the chosen boon to the next timeline', () => {
    const state = createGameState(0, 3)
    seedProducingWorld(state)
    fracture(state, 'organic', computeMods(state), 0)

    const withBoon = computeMods(state)
    const boon = ORIENTATIONS.organic.boon
    if (boon.kind !== 'resourceMult') throw new Error('expected a resource boon')

    expect(withBoon.perResource.energy).toBeCloseTo(1 + boon.perLevel, 6)
  })

  it('a Mystic timeline lifts every other timeline chronon output', () => {
    const state = createGameState(0, 3)
    seedProducingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)

    const industrialOnly = totalChrononRate(state, computeMods(state))

    seedProducingWorld(state)
    fracture(state, 'mystic', computeMods(state), 0)

    const mods = computeMods(state)
    const first = state.legacies[0]
    expect(legacyChrononRate(first, mods)).toBeGreaterThan(industrialOnly)
  })
})

describe('investing', () => {
  it('costs chronons and multiplies the timeline output', () => {
    const state = createGameState(0, 8)
    seedProducingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)

    const legacy = state.legacies[0]
    const before = legacyChrononRate(legacy, computeMods(state))

    state.meta.chronon = investCost(0)
    expect(investInLegacy(state, legacy.id)).toBe(true)

    expect(state.meta.chronon).toBeCloseTo(0, 8)
    expect(legacy.investLevel).toBe(1)
    expect(legacyChrononRate(legacy, computeMods(state))).toBeCloseTo(before * 1.6, 6)
  })

  it('refuses when chronons are short and changes nothing', () => {
    const state = createGameState(0, 8)
    seedProducingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)

    state.meta.chronon = investCost(0) - 1
    expect(investInLegacy(state, state.legacies[0].id)).toBe(false)
    expect(state.legacies[0].investLevel).toBe(0)
    expect(state.meta.chronon).toBe(investCost(0) - 1)
  })

  it('the game-level action refuses too', () => {
    const state = createGameState(0, 8)
    seedProducingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)

    const game = new Game(state)
    game.invest(state.legacies[0].id)
    expect(state.legacies[0].investLevel).toBe(0)
  })
})
