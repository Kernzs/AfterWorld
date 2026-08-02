import { describe, expect, it } from 'vitest'
import { CONVERGENCE_DEPTH, CONVERGENCE_ORIENTATIONS } from '@/content/convergence'
import { computeMods } from '@/engine/formulas'
import { createGameState } from '@/engine/game'
import { fracture } from '@/engine/legacy'
import {
  canConverge,
  converge,
  convergenceProgress,
  convergenceStatus,
} from '@/engine/convergence'
import { migrate, serialize } from '@/engine/save'
import type { GameState, OrientationId } from '@/engine/types'

function producingWorld(state: GameState): void {
  const world = state.active
  world.era = 'machines'
  world.stats.lifetime.energy = 1e8
  world.stats.lifetime.matter = 1e6
  world.stats.lifetime.alloy = 5e6
  world.buildings['core-tap'].count = 120
  world.buildings['generator'].count = 60
  world.buildings['condenser'].count = 50
  world.buildings['drill'].count = 40
  world.buildings['smelter'].count = 30
  world.buildings['assembler'].count = 26
}

/** Fractures once per orientation and deepens each to `depth`. */
function buildMultiverse(depth: number, orientations = CONVERGENCE_ORIENTATIONS): GameState {
  const state = createGameState(0, 4242)
  for (const orientation of orientations) {
    producingWorld(state)
    fracture(state, orientation, computeMods(state), 0)
  }
  for (const legacy of state.legacies) legacy.investLevel = depth
  return state
}

describe('the Convergence requirement', () => {
  it('starts empty and asks for one timeline of every path', () => {
    const status = convergenceStatus(createGameState(0, 1))

    expect(status.total).toBe(4)
    expect(status.met).toBe(0)
    expect(status.complete).toBe(false)
    expect(status.slots.every((slot) => slot.legacy === null)).toBe(true)
    expect(status.slots.map((s) => s.orientation)).toEqual(CONVERGENCE_ORIENTATIONS)
  })

  it('is not satisfied by depth alone — breadth is the whole point', () => {
    const state = createGameState(0, 7)
    producingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)
    state.legacies[0].investLevel = 50

    const status = convergenceStatus(state)
    expect(status.met).toBe(1)
    expect(status.complete).toBe(false)
    expect(canConverge(state)).toBe(false)
  })

  it('is not satisfied by breadth alone either', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH - 1)

    const status = convergenceStatus(state)
    expect(status.slots.every((slot) => slot.legacy !== null)).toBe(true)
    expect(status.met).toBe(0)
    expect(canConverge(state)).toBe(false)
  })

  it('completes with one deep timeline of each path', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH)

    const status = convergenceStatus(state)
    expect(status.met).toBe(4)
    expect(status.complete).toBe(true)
    expect(canConverge(state)).toBe(true)
  })

  it('judges each path by its best timeline, not its worst', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH)

    // A fifth, shallow Industrial world must not undo the qualifying one.
    producingWorld(state)
    fracture(state, 'industrial', computeMods(state), 0)

    expect(convergenceStatus(state).complete).toBe(true)
  })

  it('gives partial credit so the bar moves before the last level', () => {
    expect(convergenceProgress(convergenceStatus(createGameState(0, 1)))).toBe(0)

    const half = convergenceProgress(convergenceStatus(buildMultiverse(CONVERGENCE_DEPTH / 2)))
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)

    expect(convergenceProgress(convergenceStatus(buildMultiverse(CONVERGENCE_DEPTH)))).toBe(1)
  })
})

describe('converging', () => {
  it('refuses until the requirement is met', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH - 1)

    expect(converge(state, 1_000)).toBe(false)
    expect(state.meta.convergedAt).toBeNull()
  })

  it('records the moment and cannot be done twice', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH)

    expect(converge(state, 1_700_000_000_000)).toBe(true)
    expect(state.meta.convergedAt).toBe(1_700_000_000_000)

    expect(canConverge(state)).toBe(false)
    expect(converge(state, 1_800_000_000_000)).toBe(false)
    expect(state.meta.convergedAt).toBe(1_700_000_000_000)
  })

  it('confiscates nothing — every world keeps producing', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH)
    const before = state.legacies.map((l) => ({ id: l.id, depth: l.investLevel }))
    const chronon = state.meta.chronon

    converge(state, 1_000)

    expect(state.legacies.map((l) => ({ id: l.id, depth: l.investLevel }))).toEqual(before)
    expect(state.meta.chronon).toBe(chronon)
    expect(state.active).toBeTruthy()
  })

  it('survives a reload, ending flag included', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH)
    converge(state, 1_700_000_000_000)
    state.meta.endingSeen = true

    const restored = migrate(JSON.parse(serialize(state)))
    expect(restored?.meta.convergedAt).toBe(1_700_000_000_000)
    expect(restored?.meta.endingSeen).toBe(true)
    expect(canConverge(restored as GameState)).toBe(false)
  })

  it('treats a save written before the goal existed as unconverged', () => {
    const state = buildMultiverse(CONVERGENCE_DEPTH)
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>
    delete (raw.meta as Record<string, unknown>).convergedAt
    delete (raw.meta as Record<string, unknown>).endingSeen

    const restored = migrate(raw)
    expect(restored?.meta.convergedAt).toBeNull()
    expect(restored?.meta.endingSeen).toBe(false)
    expect(canConverge(restored as GameState)).toBe(true)
  })
})

describe('the route the goal forces', () => {
  it('cannot be walked while ever choosing to delete the network', () => {
    // "Delete it" closes Synthetic and Mystic, so a player who always takes the
    // immediate payout can never assemble the four paths. That is the tension
    // the whole goal rests on, so it is worth asserting rather than assuming.
    const reachableAfterDelete: OrientationId[] = ['industrial', 'organic']
    const state = buildMultiverse(CONVERGENCE_DEPTH, reachableAfterDelete)

    const status = convergenceStatus(state)
    expect(status.met).toBe(2)
    expect(status.complete).toBe(false)
  })
})
