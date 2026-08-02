/**
 * Per-frame compositor.
 *
 * Everything expensive already happened in surface.ts and is cached; this file
 * is only allowed to do work proportional to a handful of draw calls, so it
 * stays cheap enough to run at 60 fps next to a 20 Hz simulation.
 *
 * The planet rotates by sliding a window across the cached equirectangular
 * strip and clipping it to a circle, then laying a spherical shading pass over
 * the top. It is not a real projection — the limb darkening is doing the work
 * of convincing you it is — but it costs two drawImage calls instead of a
 * per-pixel warp every frame.
 */

import type { PlanetVisualState } from '@/engine/types'
import { MAP_H, MAP_W, getSurface } from './surface'
import { paletteFor } from './palette'
import { makeRng, subSeed } from './rng'

export interface DrawOptions {
  /** Milliseconds, monotonic. Only used for animation phase. */
  time: number
  reducedMotion: boolean
  /** Background starfield. Off for thumbnails, where it reads as noise. */
  stars?: boolean
  /** Pin the rotation phase (0..1) instead of deriving it from `time`. */
  spin?: number
  /** Planet radius as a fraction of the smaller canvas dimension. */
  scale?: number
}

/** Seconds for one full rotation. Slow enough to be calm, fast enough to notice. */
const ROTATION_PERIOD = 110

interface Star {
  x: number
  y: number
  radius: number
  base: number
  phase: number
}

const starCache = new Map<number, Star[]>()

function getStars(seed: number): Star[] {
  const cached = starCache.get(seed)
  if (cached) return cached

  const rng = makeRng(subSeed(seed, 3))
  const stars: Star[] = []
  for (let i = 0; i < 220; i++) {
    stars.push({
      x: rng(),
      y: rng(),
      radius: 0.4 + rng() * rng() * 1.7,
      base: 0.18 + rng() * 0.62,
      phase: rng() * Math.PI * 2,
    })
  }

  if (starCache.size > 24) starCache.clear()
  starCache.set(seed, stars)
  return stars
}

function drawStarfield(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  width: number,
  height: number,
  opts: DrawOptions,
): void {
  const stars = getStars(visual.seed)
  const t = opts.time / 1000

  for (const star of stars) {
    const twinkle = opts.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 0.9 + star.phase)
    ctx.globalAlpha = star.base * twinkle
    ctx.fillStyle = '#dfe8ff'
    ctx.beginPath()
    ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 1
}

/** Slides a half-strip window across the cached surface, wrapping at the seam. */
function drawSurfaceDisc(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  cx: number,
  cy: number,
  radius: number,
  opts: DrawOptions,
): void {
  const strip = getSurface(visual)
  if (strip.width === 0) return

  const spin =
    opts.spin ?? (opts.reducedMotion ? 0.2 : (opts.time / 1000 / ROTATION_PERIOD) % 1)
  const windowWidth = MAP_W / 2
  const sx = spin * MAP_W

  const left = cx - radius
  const top = cy - radius
  const diameter = radius * 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()

  const firstWidth = Math.min(windowWidth, MAP_W - sx)
  const firstRatio = firstWidth / windowWidth

  ctx.drawImage(
    strip,
    sx,
    0,
    firstWidth,
    MAP_H,
    left,
    top,
    diameter * firstRatio,
    diameter,
  )

  if (firstWidth < windowWidth) {
    const secondWidth = windowWidth - firstWidth
    ctx.drawImage(
      strip,
      0,
      0,
      secondWidth,
      MAP_H,
      left + diameter * firstRatio,
      top,
      diameter * (secondWidth / windowWidth),
      diameter,
    )
  }

  applySphereShading(ctx, cx, cy, radius)
  ctx.restore()
}

/**
 * One radial gradient does the whole job: a highlight offset toward the light,
 * falling through neutral, into heavy darkening at the limb. Without this the
 * strip reads as a flat disc and the illusion collapses immediately.
 */
function applySphereShading(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  const lightX = cx - radius * 0.32
  const lightY = cy - radius * 0.36

  const gradient = ctx.createRadialGradient(
    lightX,
    lightY,
    radius * 0.05,
    cx,
    cy,
    radius * 1.02,
  )
  gradient.addColorStop(0, 'rgba(255, 246, 224, 0.20)')
  gradient.addColorStop(0.32, 'rgba(255, 255, 255, 0.02)')
  gradient.addColorStop(0.58, 'rgba(0, 0, 8, 0.18)')
  gradient.addColorStop(0.82, 'rgba(0, 0, 8, 0.58)')
  gradient.addColorStop(1, 'rgba(0, 0, 6, 0.86)')

  ctx.fillStyle = gradient
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
}

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  cx: number,
  cy: number,
  radius: number,
  opts: DrawOptions,
): void {
  const palette = paletteFor(visual.era, visual.orientation)

  // Thicker atmosphere once there are oceans to evaporate.
  const thickness = 0.06 + visual.ocean * 0.09
  const outer = radius * (1 + thickness * 2.4)

  const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, outer)
  halo.addColorStop(0, palette.rim)
  halo.addColorStop(0.35, palette.halo)
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, outer, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // A bright crescent where the light grazes the limb.
  const pulse = opts.reducedMotion ? 1 : 0.92 + 0.08 * Math.sin(opts.time / 1400)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = palette.rim
  ctx.lineWidth = Math.max(1, radius * 0.035 * pulse)
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 0.995, Math.PI * 0.62, Math.PI * 1.78)
  ctx.stroke()
  ctx.restore()
}

/** The molten heart of a world that has not been rebuilt yet. */
function drawCoreGlow(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  cx: number,
  cy: number,
  radius: number,
  opts: DrawOptions,
): void {
  const strength = visual.era === 'dead-core' ? 1 - visual.terraform * 0.7 : 0
  if (strength <= 0.02) return

  const pulse = opts.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(opts.time / 900)
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.75 * pulse)
  glow.addColorStop(0, `rgba(255, 138, 62, ${0.34 * strength})`)
  glow.addColorStop(0.5, `rgba(255, 96, 40, ${0.14 * strength})`)
  glow.addColorStop(1, 'rgba(255, 80, 30, 0)')

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawOrbitalRing(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  cx: number,
  cy: number,
  radius: number,
  opts: DrawOptions,
): void {
  if (visual.orbital <= 0.01) return

  const tilt = -0.28
  const rx = radius * 1.34
  const ry = radius * (0.26 + visual.orbital * 0.06)
  const alpha = 0.22 + visual.orbital * 0.5

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.translate(cx, cy)
  ctx.rotate(tilt)

  ctx.strokeStyle = `rgba(150, 205, 255, ${alpha})`
  ctx.lineWidth = Math.max(1, radius * 0.012)
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Collectors riding the ring. Count follows the ring's completeness.
  const count = Math.floor(4 + visual.orbital * 16)
  const t = opts.reducedMotion ? 0 : opts.time / 9000
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + t
    const x = Math.cos(angle) * rx
    const y = Math.sin(angle) * ry
    const depth = (Math.sin(angle) + 1) / 2
    ctx.fillStyle = `rgba(190, 228, 255, ${(0.3 + depth * 0.6) * alpha * 2})`
    ctx.beginPath()
    ctx.arc(x, y, radius * (0.008 + depth * 0.012), 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/** Temporal stress, building toward the fracture. */
function drawInstability(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  cx: number,
  cy: number,
  radius: number,
  opts: DrawOptions,
): void {
  const strength = visual.instability
  if (strength <= 0.02) return

  const t = opts.reducedMotion ? 0 : opts.time / 1000
  const rng = makeRng(subSeed(visual.seed, 11))

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  const arcs = 3
  for (let i = 0; i < arcs; i++) {
    const phase = rng() * Math.PI * 2
    const speed = 0.25 + rng() * 0.4
    const start = phase + t * speed
    const sweep = 0.5 + rng() * 1.1
    const offset = 1.04 + i * 0.07
    const alpha = strength * strength * (0.42 - i * 0.1)
    if (alpha <= 0) continue

    ctx.strokeStyle = `rgba(183, 140, 255, ${alpha})`
    ctx.lineWidth = Math.max(1, radius * 0.018 * (1 - i * 0.22))
    ctx.beginPath()
    ctx.arc(cx, cy, radius * offset, start, start + sweep)
    ctx.stroke()
  }

  // Once the fracture is genuinely close, the whole world starts to bleed.
  if (strength > 0.75) {
    const bleed = (strength - 0.75) / 0.25
    const shimmer = opts.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.1)
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 1.5)
    glow.addColorStop(0, 'rgba(183, 140, 255, 0)')
    glow.addColorStop(0.62, `rgba(183, 140, 255, ${0.2 * bleed * shimmer})`)
    glow.addColorStop(1, 'rgba(140, 90, 255, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Draws a complete planet into `ctx`, which is assumed to already be scaled to
 * device pixels. `width` and `height` are in CSS pixels.
 */
export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  visual: PlanetVisualState,
  width: number,
  height: number,
  opts: DrawOptions,
): void {
  ctx.clearRect(0, 0, width, height)

  const cx = width / 2
  const cy = height / 2
  // Leave room for the atmosphere, ring and rift arcs, which all overhang.
  const radius = Math.min(width, height) * (opts.scale ?? 0.33)

  if (opts.stars !== false) drawStarfield(ctx, visual, width, height, opts)
  drawAtmosphere(ctx, visual, cx, cy, radius, opts)
  drawSurfaceDisc(ctx, visual, cx, cy, radius, opts)
  drawCoreGlow(ctx, visual, cx, cy, radius, opts)
  drawOrbitalRing(ctx, visual, cx, cy, radius, opts)
  drawInstability(ctx, visual, cx, cy, radius, opts)
}
