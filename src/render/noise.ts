/**
 * 3D value noise with fractal summation.
 *
 * Three dimensions rather than two because the terrain is sampled on an actual
 * sphere: the strip texture wraps horizontally, and a 2D field cannot be made
 * seamless across that seam without visible mirroring.
 */

import { makeRng } from './rng'

const PERM_SIZE = 256
const PERM_MASK = PERM_SIZE - 1

export interface NoiseField {
  /** Raw value noise in roughly -1..1. */
  sample(x: number, y: number, z: number): number
  /** Fractal sum of `octaves` samples, normalised to roughly -1..1. */
  fbm(x: number, y: number, z: number, octaves: number, lacunarity?: number, gain?: number): number
}

function fade(t: number): number {
  // Smoothstep. Quintic would be smoother but this is sampled a million times
  // per rebuild and the difference is invisible under the limb darkening.
  return t * t * (3 - 2 * t)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function makeNoise(seed: number): NoiseField {
  const rng = makeRng(seed)

  // A table of random gradients-as-values, indexed by a hashed lattice point.
  const values = new Float32Array(PERM_SIZE)
  for (let i = 0; i < PERM_SIZE; i++) values[i] = rng() * 2 - 1

  const perm = new Uint8Array(PERM_SIZE)
  for (let i = 0; i < PERM_SIZE; i++) perm[i] = i
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = perm[i]
    perm[i] = perm[j]
    perm[j] = tmp
  }

  const hash = (x: number, y: number, z: number): number =>
    values[perm[(perm[(perm[x & PERM_MASK] + y) & PERM_MASK] + z) & PERM_MASK]]

  function sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)

    const tx = fade(x - xi)
    const ty = fade(y - yi)
    const tz = fade(z - zi)

    const c000 = hash(xi, yi, zi)
    const c100 = hash(xi + 1, yi, zi)
    const c010 = hash(xi, yi + 1, zi)
    const c110 = hash(xi + 1, yi + 1, zi)
    const c001 = hash(xi, yi, zi + 1)
    const c101 = hash(xi + 1, yi, zi + 1)
    const c011 = hash(xi, yi + 1, zi + 1)
    const c111 = hash(xi + 1, yi + 1, zi + 1)

    const x00 = lerp(c000, c100, tx)
    const x10 = lerp(c010, c110, tx)
    const x01 = lerp(c001, c101, tx)
    const x11 = lerp(c011, c111, tx)

    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz)
  }

  function fbm(
    x: number,
    y: number,
    z: number,
    octaves: number,
    lacunarity = 2,
    gain = 0.5,
  ): number {
    let amplitude = 1
    let frequency = 1
    let total = 0
    let norm = 0

    for (let i = 0; i < octaves; i++) {
      total += sample(x * frequency, y * frequency, z * frequency) * amplitude
      norm += amplitude
      amplitude *= gain
      frequency *= lacunarity
    }

    return norm > 0 ? total / norm : 0
  }

  return { sample, fbm }
}
