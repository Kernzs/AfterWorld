import type { OrientationDef, OrientationId } from '@/engine/types'

export const ORIENTATION_ORDER: OrientationId[] = ['industrial', 'organic', 'synthetic', 'mystic']

/**
 * Chosen at the moment of fracture, and permanent. It sets both what the
 * frozen timeline yields in chronons and what it gives every other timeline
 * for the rest of the game — which is what makes the choice weigh anything.
 *
 * `industrial` and `organic` are always available; `synthetic` and `mystic`
 * are gated behind the event choices made during that timeline.
 */
export const ORIENTATIONS: Record<OrientationId, OrientationDef> = {
  industrial: {
    id: 'industrial',
    name: 'Industrial',
    blurb: 'Smoke, output, and no apologies.',
    consequence:
      'Yields the most chronons of any path. Every other timeline produces more matter.',
    colorVar: '--color-industrial',
    chrononMult: 1.4,
    boon: { kind: 'resourceMult', resource: 'matter', perLevel: 0.12 },
  },
  organic: {
    id: 'organic',
    name: 'Organic',
    blurb: 'Slow, green, and patient with you.',
    consequence:
      'Bleeds chronons reluctantly. In exchange, every other timeline runs on far more energy.',
    colorVar: '--color-organic',
    chrononMult: 0.85,
    boon: { kind: 'resourceMult', resource: 'energy', perLevel: 0.22 },
  },
  synthetic: {
    id: 'synthetic',
    name: 'Synthetic',
    blurb: 'It kept building after you stopped watching.',
    consequence:
      'Steady chronon yield. Everything costs less to build, everywhere, forever.',
    colorVar: '--color-synthetic',
    chrononMult: 1.0,
    boon: { kind: 'costReduction', perLevel: 0.035 },
  },
  mystic: {
    id: 'mystic',
    name: 'Mystic',
    blurb: 'Something in the rock learned to look back.',
    consequence:
      'Amplifies the chronon output of every other fractured timeline, including ones you have not made yet.',
    colorVar: '--color-mystic',
    chrononMult: 1.15,
    boon: { kind: 'chrononMult', perLevel: 0.15 },
  },
}

/** Orientations available before any event choices are made. */
export const BASE_ORIENTATIONS: OrientationId[] = ['industrial', 'organic']

/** Chronon cost to raise a legacy world's invest level from `level` to `level + 1`. */
export function investCost(level: number): number {
  return 60 * Math.pow(2.4, level)
}

/** Output multiplier a legacy world gets from its invest level. */
export function investMult(level: number): number {
  return Math.pow(1.6, level)
}

/** How strongly a legacy world's boon applies at a given invest level. */
export function boonStrength(perLevel: number, level: number): number {
  return perLevel * (1 + level)
}
