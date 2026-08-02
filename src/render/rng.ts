/**
 * Deterministic pseudo-randomness.
 *
 * Every visual detail of a world derives from its seed, and nothing else. This
 * is not a nicety: the player revisits frozen timelines across sessions, so a
 * world that looked one way must look exactly that way after a reload, on any
 * machine, forever.
 */

export type Rng = () => number

/** mulberry32 — small, fast, and good enough for scattering points. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Derives an independent stream from the same world seed. */
export function subSeed(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0
  return (x ^ (x >>> 15)) >>> 0 || 1
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Roughly normal, via the sum of three uniforms. Cheap and adequate. */
export function bell(rng: Rng): number {
  return (rng() + rng() + rng()) / 3
}
