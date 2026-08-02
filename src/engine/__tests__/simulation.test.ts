import { describe, expect, it } from 'vitest'
import { BUILDINGS, BUILDING_TICK_ORDER } from '@/content/buildings'
import { computeMods } from '@/engine/formulas'
import { Game, createGameState, tickWorldAndLegacies } from '@/engine/game'
import { resourceRate, tickWorld } from '@/engine/world'

describe('production chains', () => {
  it('runs a starved consumer at partial efficiency rather than stalling', () => {
    const state = createGameState(0, 42)
    const mods = computeMods(state)
    const world = state.active

    // One generator (26 energy/s) behind ten condensers (40 energy/s of demand).
    world.era = 'first-matter'
    world.buildings['generator'].count = 1
    world.buildings['condenser'].count = 10

    tickWorld(world, 1, mods)

    const efficiency = world.buildings['condenser'].efficiency
    expect(efficiency).toBeGreaterThan(0)
    expect(efficiency).toBeLessThan(1)
    expect(world.resources.matter).toBeGreaterThan(0)
  })

  it('runs at full efficiency when the input is plentiful', () => {
    const state = createGameState(0, 42)
    const mods = computeMods(state)
    const world = state.active

    world.era = 'first-matter'
    world.buildings['generator'].count = 100
    world.buildings['condenser'].count = 10

    tickWorld(world, 1, mods)
    expect(world.buildings['condenser'].efficiency).toBe(1)
  })

  it('leaves a consumed resource room to accumulate, however heavy the demand', () => {
    const state = createGameState(0, 42)
    const mods = computeMods(state)
    const world = state.active

    // Wildly over-built: 500 condensers want 2000 energy/s from one generator.
    world.era = 'first-matter'
    world.buildings['generator'].count = 1
    world.buildings['condenser'].count = 500

    const before = world.resources.energy
    const { gross } = tickWorld(world, 1, mods)

    // Without a throughput cap this is exactly zero and the game deadlocks:
    // matter is both consumed and spent, so the stock could never recover.
    const accumulated = world.resources.energy - before
    expect(accumulated).toBeGreaterThan(0)
    expect(accumulated).toBeCloseTo(gross.energy * 0.2, 6)
  })

  it('feeds consumers from complete production, not a partial pass', () => {
    // The throughput cap is computed from production accumulated *so far* in
    // the tick, so every producer of a resource must run before its consumers.
    // If this ever fails, efficiencies silently start lagging a tick behind.
    for (const resource of ['energy', 'matter', 'alloy'] as const) {
      let lastProducer = -1
      let firstConsumer = Number.MAX_SAFE_INTEGER

      BUILDING_TICK_ORDER.forEach((id, index) => {
        const def = BUILDINGS[id]
        if (def.produces === resource) lastProducer = Math.max(lastProducer, index)
        if (def.consumes?.[resource]) firstConsumer = Math.min(firstConsumer, index)
      })

      if (firstConsumer !== Number.MAX_SAFE_INTEGER) {
        expect(lastProducer, `${resource} consumers run before its producers`).toBeLessThan(
          firstConsumer,
        )
      }
    }
  })

  it('never drives a resource negative', () => {
    const state = createGameState(0, 42)
    const mods = computeMods(state)
    const world = state.active

    world.era = 'machines'
    world.buildings['smelter'].count = 50
    world.buildings['assembler'].count = 50
    world.resources.energy = 1
    world.resources.matter = 1

    for (let i = 0; i < 200; i++) tickWorld(world, 0.05, mods)

    expect(world.resources.energy).toBeGreaterThanOrEqual(0)
    expect(world.resources.matter).toBeGreaterThanOrEqual(0)
    expect(world.resources.alloy).toBeGreaterThanOrEqual(0)
  })

  it('tracks lifetime totals from gross production, not net', () => {
    const state = createGameState(0, 42)
    const mods = computeMods(state)
    const world = state.active

    // Generators produce energy; condensers eat all of it.
    world.era = 'first-matter'
    world.buildings['generator'].count = 4
    world.buildings['condenser'].count = 60
    world.resources.energy = 0

    const before = world.stats.lifetime.energy
    tickWorld(world, 1, mods)

    // Net energy is flat or falling, but the generators still ran.
    expect(world.stats.lifetime.energy).toBeGreaterThan(before)
  })
})

describe('offline catch-up', () => {
  it('lands within a fraction of a percent of running it in real time', () => {
    const seconds = 600

    const fine = createGameState(0, 2024)
    seedMidGame(fine)
    const fineMods = computeMods(fine)
    for (let i = 0; i < seconds * 20; i++) tickWorldAndLegacies(fine, 0.05, fineMods)

    const coarse = createGameState(0, 2024)
    seedMidGame(coarse)
    const game = new Game(coarse)
    game.catchUp(seconds)

    for (const key of ['energy', 'matter', 'alloy'] as const) {
      const a = fine.active.resources[key]
      const b = coarse.active.resources[key]
      const scale = Math.max(a, b, 1)
      expect(Math.abs(a - b) / scale).toBeLessThan(0.005)
    }
  })

  it('stops accruing at the offline cap', () => {
    const state = createGameState(0, 5)
    seedMidGame(state)
    const game = new Game(state)

    const capped = game.catchUp(48 * 3_600)
    expect(capped.capped).toBe(true)
    expect(capped.seconds).toBe(8 * 3_600)
  })

  it('reports nothing for a short absence', () => {
    const state = createGameState(0, 5)
    seedMidGame(state)
    const game = new Game(state)

    state.lastSeenAt = Date.now() - 10_000
    game.applyOfflineTime(Date.now())
    expect(game.offlineReport).toBeNull()
  })

  it('credits a real absence', () => {
    const state = createGameState(0, 5)
    seedMidGame(state)
    const game = new Game(state)

    const before = state.active.resources.energy
    state.lastSeenAt = Date.now() - 30 * 60_000
    game.applyOfflineTime(Date.now())

    expect(game.offlineReport).not.toBeNull()
    expect(state.active.resources.energy).toBeGreaterThan(before)
  })
})

describe('manual pulse', () => {
  it('scales with the global multiplier and counts toward lifetime', () => {
    const state = createGameState(0, 5)
    const game = new Game(state)

    game.pulse()
    expect(state.active.resources.energy).toBe(1)
    expect(state.active.stats.lifetime.energy).toBe(1)
  })
})

describe('rates', () => {
  it('resourceRate matches what a one-second tick actually produces', () => {
    const state = createGameState(0, 11)
    const mods = computeMods(state)
    const world = state.active

    world.buildings['core-tap'].count = 30
    world.buildings['thermal-vent'].count = 12

    const predicted = resourceRate(world, 'energy', mods)
    const before = world.resources.energy
    tickWorld(world, 1, mods)

    expect(world.resources.energy - before).toBeCloseTo(predicted, 6)
  })
})

/** A world part-way through era 3, with enough stock to run unstarved. */
function seedMidGame(state: ReturnType<typeof createGameState>): void {
  const world = state.active
  world.era = 'machines'
  world.stats.lifetime.energy = 1e7
  world.stats.lifetime.matter = 5e5
  world.stats.lifetime.alloy = 1e4
  world.resources.energy = 1e8
  world.resources.matter = 1e6
  world.resources.alloy = 1e4

  world.buildings['core-tap'].count = 80
  world.buildings['thermal-vent'].count = 60
  world.buildings['generator'].count = 40
  world.buildings['condenser'].count = 30
  world.buildings['drill'].count = 25
  world.buildings['smelter'].count = 15
  world.buildings['orbital-collector'].count = 5
}
