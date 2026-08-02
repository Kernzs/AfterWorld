import { CONVERGENCE_DEPTH, CONVERGENCE_ORIENTATIONS } from '@/content/convergence'
import type { GameState, LegacyWorld, OrientationId } from './types'

export interface ConvergenceSlot {
  orientation: OrientationId
  /** The deepest timeline of this orientation, or null if none exists yet. */
  legacy: LegacyWorld | null
  depth: number
  ready: boolean
}

export interface ConvergenceStatus {
  slots: ConvergenceSlot[]
  requiredDepth: number
  /** Slots that are filled and deep enough. */
  met: number
  total: number
  complete: boolean
  converged: boolean
}

/**
 * Each orientation is judged by its *best* timeline, so a player who fractured
 * two Industrial worlds is not penalised for it — only for the paths they have
 * not walked at all.
 */
export function convergenceStatus(state: GameState): ConvergenceStatus {
  const slots: ConvergenceSlot[] = CONVERGENCE_ORIENTATIONS.map((orientation) => {
    let best: LegacyWorld | null = null
    for (const legacy of state.legacies) {
      if (legacy.orientation !== orientation) continue
      if (!best || legacy.investLevel > best.investLevel) best = legacy
    }

    const depth = best?.investLevel ?? 0
    return {
      orientation,
      legacy: best,
      depth,
      ready: best !== null && depth >= CONVERGENCE_DEPTH,
    }
  })

  const met = slots.filter((slot) => slot.ready).length

  return {
    slots,
    requiredDepth: CONVERGENCE_DEPTH,
    met,
    total: slots.length,
    complete: met === slots.length,
    converged: state.meta.convergedAt !== null,
  }
}

export function canConverge(state: GameState): boolean {
  if (state.meta.convergedAt !== null) return false
  return convergenceStatus(state).complete
}

/**
 * Ends the arc. Deliberately does not reset anything — the worlds keep
 * producing, and the player keeps playing if they want to. Reaching the
 * destination should not confiscate what got them there.
 */
export function converge(state: GameState, now: number): boolean {
  if (!canConverge(state)) return false
  state.meta.convergedAt = now
  return true
}

/** 0..1, for a progress bar that is honest about partial credit. */
export function convergenceProgress(status: ConvergenceStatus): number {
  if (status.total === 0) return 0

  let earned = 0
  for (const slot of status.slots) {
    if (!slot.legacy) continue
    earned += Math.min(1, slot.depth / status.requiredDepth)
  }
  return earned / status.total
}
