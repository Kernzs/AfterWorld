import { describe, expect, it } from 'vitest'
import { BUILDING_ORDER } from '@/content/buildings'
import { UPGRADES } from '@/content/upgrades'
import { computeMods } from '@/engine/formulas'
import { createGameState } from '@/engine/game'
import { fracture } from '@/engine/legacy'
import { CONVERGENCE_ROUTE, playConvergenceArc, playUntilFracture } from './autoplay'

const CAP = 6 * 3_600
const SEED = 20260801

describe('pacing', () => {
  it('reaches the first fracture in roughly one sitting', () => {
    const state = createGameState(0, SEED)
    const run = playUntilFracture(state, CAP, 'merge')

    console.log(
      `[balance] first fracture at ${(run.seconds / 60).toFixed(1)} min · ` +
        `${state.active.upgrades.length}/${UPGRADES.length} research adopted`,
    )

    expect(run.reachedFracture).toBe(true)
    // Wide on purpose: this guards against a change that turns the slice into
    // ten minutes or into a whole evening, not against fine tuning.
    expect(run.seconds).toBeGreaterThan(40 * 60)
    expect(run.seconds).toBeLessThan(3 * 3_600)
  }, 120_000)

  it('the second timeline is meaningfully faster than the first', () => {
    const state = createGameState(0, SEED)
    const first = playUntilFracture(state, CAP, 'merge')
    expect(first.reachedFracture).toBe(true)

    fracture(state, 'industrial', computeMods(state), 0)
    const second = playUntilFracture(state, CAP, 'merge')

    console.log(
      `[balance] second timeline at ${(second.seconds / 60).toFixed(1)} min · ` +
        `${(first.seconds / second.seconds).toFixed(2)}× faster`,
    )

    expect(second.reachedFracture).toBe(true)
    expect(second.seconds).toBeLessThan(first.seconds * 0.85)
  }, 240_000)

  it('every building is worth building at some point', () => {
    const state = createGameState(0, SEED)
    playUntilFracture(state, CAP, 'merge')

    // A building nobody ever buys is content that does not exist.
    for (const id of BUILDING_ORDER) {
      expect
        .soft(state.active.buildings[id].count, `${id} was never worth building`)
        .toBeGreaterThan(0)
    }
  }, 120_000)

  it('the whole arc fits the intended session length', () => {
    const state = createGameState(0, SEED)
    const arc = playConvergenceArc(state, 12 * 3_600)

    console.log(
      `[balance] Convergence in ${(arc.seconds / 3_600).toFixed(2)} h · ` +
        `runs ${arc.runs.map((s) => (s / 60).toFixed(0) + 'm').join(' → ')} · ` +
        `deepening ${(arc.deepeningSeconds / 60).toFixed(1)}m`,
    )

    expect(arc.converged).toBe(true)
    expect(arc.runs).toHaveLength(CONVERGENCE_ROUTE.length)

    // The simulated player never idles and never misplays, so a human lands
    // above this. The window is what keeps that human inside a few sittings.
    expect(arc.seconds).toBeGreaterThan(2 * 3_600)
    expect(arc.seconds).toBeLessThan(6 * 3_600)
  }, 300_000)

  it('each timeline is quicker than the one before it', () => {
    const state = createGameState(0, SEED)
    const arc = playConvergenceArc(state, 12 * 3_600)

    for (let i = 1; i < arc.runs.length; i++) {
      expect(arc.runs[i], `run ${i + 1} should beat run ${i}`).toBeLessThan(arc.runs[i - 1])
    }
  }, 300_000)

  it('most research gets adopted on the way through', () => {
    const state = createGameState(0, SEED)
    playUntilFracture(state, CAP, 'merge')

    expect(state.active.upgrades.length).toBeGreaterThanOrEqual(
      Math.floor(UPGRADES.length * 0.6),
    )
  }, 120_000)
})
