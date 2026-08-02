import { describe, expect, it } from 'vitest'
import { computeMods } from '@/engine/formulas'
import { Game, createGameState } from '@/engine/game'
import { fracture } from '@/engine/legacy'
import { resolveEvent } from '@/engine/events'
import { exportSave, importSave, migrate, serialize } from '@/engine/save'
import type { GameState } from '@/engine/types'

function seedFracturedGame(): GameState {
  const state = createGameState(1_700_000_000_000, 31337)
  const world = state.active

  world.era = 'machines'
  world.stats.lifetime.energy = 5e7
  world.stats.lifetime.matter = 8e5
  world.stats.lifetime.alloy = 4e5
  world.resources.energy = 12_345.678
  world.resources.matter = 999
  world.buildings['core-tap'].count = 64
  world.buildings['generator'].count = 33
  world.buildings['assembler'].count = 26
  world.upgrades.push('e1-resonance-casing', 'e1-grid-synchrony')

  resolveEvent(world, 'ai-independence', 'exile')
  fracture(state, 'mystic', computeMods(state), 1_700_000_000_000)

  state.active.buildings['core-tap'].count = 12
  state.active.resources.energy = 500
  state.meta.chronon = 4_321

  return state
}

describe('save round trip', () => {
  it('restores a fractured game unchanged', () => {
    const original = seedFracturedGame()
    const restored = migrate(JSON.parse(serialize(original)))

    expect(restored).not.toBeNull()
    if (!restored) return

    expect(restored.active.buildings['core-tap'].count).toBe(12)
    expect(restored.active.resources.energy).toBeCloseTo(500, 8)
    expect(restored.meta.chronon).toBeCloseTo(4_321, 8)
    expect(restored.meta.fractures).toBe(1)
    expect(restored.meta.nextWorldIndex).toBe(3)

    expect(restored.legacies).toHaveLength(1)
    const legacy = restored.legacies[0]
    expect(legacy.orientation).toBe('mystic')
    expect(legacy.chrononBase).toBeCloseTo(original.legacies[0].chrononBase, 8)
    expect(legacy.profile.energy).toBeCloseTo(original.legacies[0].profile.energy ?? 0, 6)
    expect(legacy.seed).toBe(original.legacies[0].seed)
    // The frozen appearance must survive, or the timeline changes face on reload.
    expect(legacy.visual.terraform).toBeCloseTo(original.legacies[0].visual.terraform, 8)
  })

  it('survives an export/import cycle', () => {
    const original = seedFracturedGame()
    const restored = importSave(exportSave(original))

    expect(restored).not.toBeNull()
    expect(restored?.legacies[0].orientation).toBe('mystic')
    expect(restored?.meta.chronon).toBeCloseTo(original.meta.chronon, 8)
  })

  it('preserves event consequences across a reload', () => {
    const original = createGameState(0, 5)
    resolveEvent(original.active, 'ai-independence', 'merge')

    const restored = migrate(JSON.parse(serialize(original)))
    expect(restored?.active.eventChoices['ai-independence']).toBe('merge')
    expect(restored?.active.eventMods.global).toBeCloseTo(1.25, 8)
    expect(restored?.active.eventMods.perResource.alloy).toBeCloseTo(1.3, 8)
    expect(restored?.active.orientationsUnlocked).toContain('synthetic')
  })
})

describe('elapsed time accounting', () => {
  it('does not treat saving as having simulated the time', () => {
    // A hidden tab gets no animation frames, so the simulation is frozen while
    // the visibilitychange handler still saves. If saving moved `lastSeenAt`,
    // that frozen stretch would count as already played and the player would
    // silently lose it.
    const state = createGameState(1_700_000_000_000, 5)
    const simulatedUpTo = state.lastSeenAt

    state.active.resources.energy = 42
    const encoded = serialize(state)

    expect(state.lastSeenAt).toBe(simulatedUpTo)
    expect(JSON.parse(encoded).lastSeenAt).toBe(simulatedUpTo)
  })

  it('credits a stretch spent with the tab merely hidden', () => {
    const state = createGameState(0, 5)
    state.active.buildings['core-tap'].count = 50
    const game = new Game(state)

    const before = state.active.resources.energy
    state.lastSeenAt = Date.now() - 45 * 60_000
    game.applyOfflineTime(Date.now())

    expect(state.active.resources.energy).toBeGreaterThan(before)
    expect(game.offlineReport?.seconds).toBeCloseTo(45 * 60, 0)
  })
})

describe('save resilience', () => {
  it('rejects things that are not saves', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate('nope')).toBeNull()
    expect(migrate({ hello: 'world' })).toBeNull()
    expect(importSave('not base64 at all !!')).toBeNull()
  })

  it('backfills content that did not exist when the save was written', () => {
    const state = createGameState(0, 5)
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>

    // Simulate an older save: a building and a resource the game has since added.
    const active = raw.active as Record<string, unknown>
    delete (active.buildings as Record<string, unknown>)['orbital-collector']
    delete (active.resources as Record<string, unknown>)['alloy']

    const restored = migrate(raw)
    expect(restored?.active.buildings['orbital-collector']).toEqual({
      count: 0,
      efficiency: 1,
    })
    expect(restored?.active.resources.alloy).toBe(0)
  })

  it('drops upgrades that no longer exist rather than crashing', () => {
    const state = createGameState(0, 5)
    state.active.upgrades.push('e1-grid-synchrony', 'removed-in-a-later-patch')

    const restored = migrate(JSON.parse(serialize(state)))
    expect(restored?.active.upgrades).toEqual(['e1-grid-synchrony'])
  })

  it('repairs a save whose counters contradict its timelines', () => {
    const state = seedFracturedGame()
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>
    ;(raw.meta as Record<string, unknown>).fractures = 0
    ;(raw.meta as Record<string, unknown>).nextWorldIndex = 1

    const restored = migrate(raw)
    expect(restored?.meta.fractures).toBe(1)
    expect(restored?.meta.nextWorldIndex).toBeGreaterThan(restored?.active.index ?? 0)
  })

  it('discards a legacy with an orientation the game no longer has', () => {
    const state = seedFracturedGame()
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>
    ;(raw.legacies as Array<Record<string, unknown>>)[0].orientation = 'nonsense'

    const restored = migrate(raw)
    expect(restored?.legacies).toHaveLength(0)
  })

  it('never restores negative resources', () => {
    const state = createGameState(0, 5)
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>
    ;((raw.active as Record<string, unknown>).resources as Record<string, unknown>).energy =
      -9999

    expect(migrate(raw)?.active.resources.energy).toBe(0)
  })
})
