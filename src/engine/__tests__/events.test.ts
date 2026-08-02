import { describe, expect, it } from 'vitest'
import { EVENTS_BY_ID } from '@/content/events'
import { computeMods } from '@/engine/formulas'
import { createGameState } from '@/engine/game'
import { checkEvents, pendingEvent, resolveEvent } from '@/engine/events'
import { availableOrientations, previewFracture } from '@/engine/legacy'
import { tickWorld } from '@/engine/world'
import type { GameState, OrientationId } from '@/engine/types'

const EVENT_ID = 'ai-independence'

function seedMachineWorld(): GameState {
  const state = createGameState(0, 4242)
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

  return state
}

describe('raising the event', () => {
  it('waits until the assembler network is large enough', () => {
    const state = seedMachineWorld()
    state.active.buildings['assembler'].count = 24

    expect(checkEvents(state.active)).toBe(false)
    expect(pendingEvent(state.active)).toBeNull()

    state.active.buildings['assembler'].count = 25
    expect(checkEvents(state.active)).toBe(true)
    expect(pendingEvent(state.active)?.id).toBe(EVENT_ID)
  })

  it('never raises the same decision twice', () => {
    const state = seedMachineWorld()
    checkEvents(state.active)
    resolveEvent(state.active, EVENT_ID, 'merge')

    expect(state.active.pendingEvent).toBeNull()
    expect(checkEvents(state.active)).toBe(false)
  })

  it('refuses a choice that does not belong to the event', () => {
    const state = seedMachineWorld()
    checkEvents(state.active)

    expect(resolveEvent(state.active, EVENT_ID, 'negotiate')).toBe(false)
    expect(state.active.pendingEvent).toBe(EVENT_ID)
  })
})

/**
 * Every option is a promise made to the player in prose. These assert the
 * prose is true — that each one actually lands the effects its outcome text
 * describes, and that none of them quietly does nothing.
 */
describe('what each choice actually does', () => {
  it('Delete it: pays out alloy now and closes two paths forever', () => {
    const state = seedMachineWorld()
    const before = state.active.resources.alloy

    expect(resolveEvent(state.active, EVENT_ID, 'delete')).toBe(true)

    expect(state.active.resources.alloy).toBeCloseTo(before + 400_000, 6)
    expect(state.active.eventMods.global).toBeCloseTo(1.12, 8)

    const available = availableOrientations(state.active)
    expect(available).not.toContain('synthetic')
    expect(available).not.toContain('mystic')
    expect(available).toEqual(['industrial', 'organic'])
  })

  it('Let it go: no immediate gain, a markedly richer frozen timeline', () => {
    const state = seedMachineWorld()
    const before = state.active.resources.alloy

    expect(resolveEvent(state.active, EVENT_ID, 'free')).toBe(true)

    // The trade is explicitly deferred: nothing arrives now.
    expect(state.active.resources.alloy).toBeCloseTo(before, 6)
    expect(state.active.eventMods.global).toBe(1)
    expect(state.active.eventMods.profile).toBeCloseTo(1.35, 8)
    expect(availableOrientations(state.active)).toContain('synthetic')
  })

  it('Merge with it: production up now, alloy refining sharper', () => {
    const state = seedMachineWorld()

    expect(resolveEvent(state.active, EVENT_ID, 'merge')).toBe(true)

    expect(state.active.eventMods.global).toBeCloseTo(1.25, 8)
    expect(state.active.eventMods.perResource.alloy).toBeCloseTo(1.3, 8)
    expect(state.active.eventMods.profile).toBe(1)
    expect(availableOrientations(state.active)).toContain('synthetic')
  })

  it('Send it away: this world runs worse, the frozen one is worth far more', () => {
    const state = seedMachineWorld()

    expect(resolveEvent(state.active, EVENT_ID, 'exile')).toBe(true)

    expect(state.active.eventMods.profile).toBeCloseTo(1.65, 8)
    expect(state.active.eventMods.perResource.energy).toBeCloseTo(0.85, 8)
    expect(availableOrientations(state.active)).toContain('mystic')
    expect(availableOrientations(state.active)).not.toContain('synthetic')
  })

  it('every choice leaves a distinct mark — none is a no-op', () => {
    const fingerprints = EVENTS_BY_ID[EVENT_ID].choices.map((choice) => {
      const state = seedMachineWorld()
      resolveEvent(state.active, EVENT_ID, choice.id)
      const mods = computeMods(state)
      return JSON.stringify({
        global: mods.global,
        energy: mods.perResource.energy,
        alloy: mods.perResource.alloy,
        profile: state.active.eventMods.profile,
        alloyStock: state.active.resources.alloy,
        orientations: availableOrientations(state.active),
      })
    })

    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })
})

describe('immediate power versus a richer legacy', () => {
  it('deferring the reward really does buy a more valuable timeline', () => {
    const value = (choiceId: string, orientation: OrientationId) => {
      const state = seedMachineWorld()
      resolveEvent(state.active, EVENT_ID, choiceId)
      const mods = computeMods(state)
      tickWorld(state.active, 1, mods)
      return previewFracture(state, mods, orientation).chrononBase
    }

    // Both open Synthetic, so this is a like-for-like comparison of the trade.
    expect(value('free', 'synthetic')).toBeGreaterThan(value('merge', 'synthetic'))
  })

  it('Delete it buys the weakest legacy of the four', () => {
    const value = (choiceId: string) => {
      const state = seedMachineWorld()
      resolveEvent(state.active, EVENT_ID, choiceId)
      const mods = computeMods(state)
      tickWorld(state.active, 1, mods)
      // Industrial is the one orientation every choice leaves available.
      return previewFracture(state, mods, 'industrial').chrononBase
    }

    const deleted = value('delete')
    for (const other of ['free', 'merge', 'exile']) {
      expect(value(other), `${other} should out-value delete`).toBeGreaterThan(deleted)
    }
  })
})
