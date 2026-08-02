/**
 * Builds the planet's surface texture: an equirectangular strip that the
 * compositor wraps around a disc.
 *
 * This is the only expensive part of the renderer, so nothing here runs per
 * frame. Two caches, deliberately separate:
 *
 *   - the heightmap depends on seed and terraforming only, and is the costly
 *     one (noise sampling);
 *   - the painted strip additionally depends on sea level, vegetation, cities
 *     and era, and is cheap to repaint from an existing heightmap.
 *
 * Continuous inputs are quantised into buckets before they reach a cache key.
 * Without that, every frame would produce a new key and the cache would be a
 * memory leak that also never hits.
 */

import type { PlanetVisualState } from '@/engine/types'
import { makeNoise } from './noise'
import { makeRng, subSeed } from './rng'
import { mixRgb, paletteFor, rgbToCss, type Palette, type RGB } from './palette'

const HEIGHT_W = 256
const HEIGHT_H = 128
export const MAP_W = 512
export const MAP_H = 256

const BUCKETS = 24
const bucket = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * BUCKETS)

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------------ */
/* Caches                                                              */
/* ------------------------------------------------------------------ */

class LruCache<V> {
  private map = new Map<string, V>()
  constructor(private limit: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value !== undefined) {
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }
}

const heightCache = new LruCache<Float32Array>(12)
const surfaceCache = new LruCache<HTMLCanvasElement>(20)

/* ------------------------------------------------------------------ */
/* Heightmap                                                           */
/* ------------------------------------------------------------------ */

/**
 * Sampled on an actual sphere, so the strip wraps seamlessly and the poles
 * converge instead of smearing.
 */
function buildHeightmap(seed: number, terraform: number): Float32Array {
  const noise = makeNoise(subSeed(seed, 1))
  const heights = new Float32Array(HEIGHT_W * HEIGHT_H)

  // More terraforming means sharper relief: the crust has been worked.
  const relief = 0.55 + 0.85 * terraform
  const detailFreq = 2.6
  const continentFreq = 0.9

  for (let y = 0; y < HEIGHT_H; y++) {
    const lat = ((y + 0.5) / HEIGHT_H - 0.5) * Math.PI
    const cosLat = Math.cos(lat)
    const sinLat = Math.sin(lat)

    for (let x = 0; x < HEIGHT_W; x++) {
      const lon = ((x + 0.5) / HEIGHT_W) * Math.PI * 2
      const px = cosLat * Math.cos(lon)
      const py = cosLat * Math.sin(lon)
      const pz = sinLat

      const continents = noise.fbm(
        px * continentFreq,
        py * continentFreq,
        pz * continentFreq,
        2,
      )
      const detail = noise.fbm(px * detailFreq, py * detailFreq, pz * detailFreq, 4)

      heights[y * HEIGHT_W + x] = continents * 0.72 + detail * 0.5 * relief
    }
  }

  return heights
}

function getHeightmap(seed: number, terraform: number): Float32Array {
  const key = `${seed}:${bucket(terraform)}`
  const cached = heightCache.get(key)
  if (cached) return cached

  const built = buildHeightmap(seed, bucket(terraform) / BUCKETS)
  heightCache.set(key, built)
  return built
}

/** Bilinear sample with horizontal wrap and vertical clamp. */
function sampleHeight(heights: Float32Array, u: number, v: number): number {
  const fx = u * HEIGHT_W - 0.5
  const fy = Math.min(Math.max(v * HEIGHT_H - 0.5, 0), HEIGHT_H - 1)

  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0

  const xa = ((x0 % HEIGHT_W) + HEIGHT_W) % HEIGHT_W
  const xb = (xa + 1) % HEIGHT_W
  const ya = Math.min(Math.max(y0, 0), HEIGHT_H - 1)
  const yb = Math.min(ya + 1, HEIGHT_H - 1)

  const h00 = heights[ya * HEIGHT_W + xa]
  const h10 = heights[ya * HEIGHT_W + xb]
  const h01 = heights[yb * HEIGHT_W + xa]
  const h11 = heights[yb * HEIGHT_W + xb]

  const top = h00 + (h10 - h00) * tx
  const bottom = h01 + (h11 - h01) * tx
  return top + (bottom - top) * ty
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

function seaLevelFor(ocean: number): number {
  // At ocean = 0 the level sits below almost all terrain; at 1 it drowns most
  // of it but never all, so there is always a coastline to look at.
  return -0.42 + ocean * 0.62
}

function terrainColor(
  palette: Palette,
  height: number,
  seaLevel: number,
  visual: PlanetVisualState,
): RGB {
  if (height < seaLevel) {
    const depth = clamp01((seaLevel - height) / 0.55)
    return mixRgb(palette.shallow, palette.abyss, depth)
  }

  const t = clamp01((height - seaLevel) / Math.max(0.001, 1 - seaLevel))

  let color: RGB
  if (t < 0.06) color = mixRgb(palette.shore, palette.lowland, t / 0.06)
  else if (t < 0.45) color = mixRgb(palette.lowland, palette.upland, (t - 0.06) / 0.39)
  else color = mixRgb(palette.upland, palette.peak, clamp01((t - 0.45) / 0.55))

  if (visual.biomass > 0) {
    // Life clusters in the temperate band: off the shoreline, below the peaks.
    const band = smoothstep(0.01, 0.14, t) * (1 - smoothstep(0.42, 0.78, t))
    color = mixRgb(color, palette.vegetation, visual.biomass * band * 0.92)
  }

  return color
}

function paintSurface(visual: PlanetVisualState): HTMLCanvasElement {
  const palette = paletteFor(visual.era, visual.orientation)
  const heights = getHeightmap(visual.seed, visual.terraform)
  const seaLevel = seaLevelFor(visual.ocean)

  const canvas = document.createElement('canvas')
  canvas.width = MAP_W
  canvas.height = MAP_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const image = ctx.createImageData(MAP_W, MAP_H)
  const data = image.data

  // Molten light only shows through a crust that has not been reworked yet.
  const moltenStrength = visual.era === 'dead-core' ? 1 - visual.terraform * 0.85 : 0
  const du = 1 / MAP_W
  const dv = 1 / MAP_H

  for (let y = 0; y < MAP_H; y++) {
    const v = (y + 0.5) / MAP_H
    for (let x = 0; x < MAP_W; x++) {
      const u = (x + 0.5) / MAP_W
      const h = sampleHeight(heights, u, v)

      let color = terrainColor(palette, h, seaLevel, visual)

      // Relief shading from a fixed light. Cheap, and does more for perceived
      // quality than any amount of extra noise detail.
      if (h >= seaLevel) {
        const hx = sampleHeight(heights, u + du, v)
        const hy = sampleHeight(heights, u, v + dv)
        const slope = (h - hx) * 2.4 + (h - hy) * 1.6
        const shade = clamp01(0.5 + slope * 3)
        const lit = 0.72 + shade * 0.56
        color = [
          Math.min(255, color[0] * lit),
          Math.min(255, color[1] * lit),
          Math.min(255, color[2] * lit),
        ]
      }

      if (moltenStrength > 0) {
        const crack = clamp01((seaLevel + 0.12 - h) / 0.3)
        const glow = crack * crack * moltenStrength
        if (glow > 0.01) {
          color = [
            Math.min(255, color[0] + palette.molten[0] * glow),
            Math.min(255, color[1] + palette.molten[1] * glow * 0.55),
            Math.min(255, color[2] + palette.molten[2] * glow * 0.3),
          ]
        }
      }

      const i = (y * MAP_W + x) * 4
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)

  if (visual.civilization > 0) {
    paintCities(ctx, heights, seaLevel, palette, visual)
  }

  return canvas
}

/**
 * City lights are baked into the strip rather than drawn per frame so they
 * rotate with the surface. A screen-space overlay would slide across the
 * planet and read as a bug.
 */
function paintCities(
  ctx: CanvasRenderingContext2D,
  heights: Float32Array,
  seaLevel: number,
  palette: Palette,
  visual: PlanetVisualState,
): void {
  const rng = makeRng(subSeed(visual.seed, 7))
  const CANDIDATES = 520
  const target = Math.floor(CANDIDATES * visual.civilization)
  if (target <= 0) return

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  let placed = 0
  for (let i = 0; i < CANDIDATES && placed < target; i++) {
    const u = rng()
    // Bias away from the poles, where the strip is most distorted and where
    // nobody would build anyway.
    const v = 0.5 + (rng() - 0.5) * 1.5 * 0.62
    const jitter = rng()

    const h = sampleHeight(heights, u, v)
    if (h < seaLevel + 0.015) continue

    placed++

    const x = u * MAP_W
    const y = v * MAP_H
    const radius = 2.2 + jitter * 5.5 * (0.4 + visual.civilization * 0.6)
    const intensity = 0.34 + jitter * 0.42

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, rgbToCss(palette.city, intensity))
    gradient.addColorStop(0.45, rgbToCss(palette.city, intensity * 0.35))
    gradient.addColorStop(1, rgbToCss(palette.city, 0))

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

function surfaceKey(visual: PlanetVisualState): string {
  return [
    visual.seed,
    visual.era,
    visual.orientation ?? '-',
    bucket(visual.terraform),
    bucket(visual.ocean),
    bucket(visual.biomass),
    bucket(visual.civilization),
  ].join('|')
}

/** Cached surface strip for a world. Safe to call every frame. */
export function getSurface(visual: PlanetVisualState): HTMLCanvasElement {
  const key = surfaceKey(visual)
  const cached = surfaceCache.get(key)
  if (cached) return cached

  const built = paintSurface(visual)
  surfaceCache.set(key, built)
  return built
}
