/**
 * The fracture transition.
 *
 * This is the most important moment in the game — the old world stops being
 * yours and becomes a fixed thing — so it gets staged rather than swapped. The
 * sequence is: the doomed world contracts under rising temporal stress, a rift
 * opens through it, everything whites out, and the next dead core resolves out
 * of the flash.
 *
 * It reuses `drawPlanet` for both worlds rather than reimplementing anything;
 * the only additions are the shockwaves and the flash.
 */

import type { PlanetVisualState } from '@/engine/types'
import { drawPlanet } from './planet'
import { orientationTint, rgbToCss, type RGB } from './palette'

export const FRACTURE_DURATION_MS = 2_400

/**
 * Reduced motion still gets a transition — the player must see that something
 * decisive happened — but a short cross-fade with no expansion or contraction.
 */
const REDUCED_DURATION_MS = 700

/** Point in the transition where the old world gives way to the new one. */
const HANDOVER = 0.5

const RIFT: RGB = [183, 140, 255]

export function fractureDuration(reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_DURATION_MS : FRACTURE_DURATION_MS
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeIn = (t: number) => t * t * t
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export interface FractureFrame {
  /** The world being frozen, exactly as it will be remembered. */
  from: PlanetVisualState
  /** The world being born. */
  to: PlanetVisualState
  /** 0..1 through the transition. */
  progress: number
  time: number
  reducedMotion: boolean
}

export function drawFracture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: FractureFrame,
): void {
  const { from, to, progress, time, reducedMotion } = frame
  const p = clamp01(progress)
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.33

  // The rift takes on the colour of whatever the world was locked into.
  const tint = from.orientation ? orientationTint(from.orientation) : RIFT

  if (reducedMotion) {
    drawCrossfade(ctx, width, height, frame, p, tint)
    return
  }

  if (p < HANDOVER) {
    const local = p / HANDOVER

    // Stress climbs to its maximum, and the world draws in on itself.
    const doomed: PlanetVisualState = { ...from, instability: 1 }
    drawPlanet(ctx, doomed, width, height, {
      time,
      reducedMotion: false,
      scale: 0.33 * (1 - easeIn(local) * 0.16),
    })

    drawShockwaves(ctx, cx, cy, radius, easeOut(local), 1 - local, tint)
    drawCoreBreach(ctx, cx, cy, radius, local, tint)
  } else {
    const local = (p - HANDOVER) / (1 - HANDOVER)

    // The new world resolves out of the flash, settling into place.
    drawPlanet(ctx, to, width, height, {
      time,
      reducedMotion: false,
      scale: 0.33 * (0.86 + easeOut(local) * 0.14),
    })

    // Wavefronts still receding from the break.
    drawShockwaves(ctx, cx, cy, radius, 1 + local * 1.2, Math.pow(1 - local, 2), tint)
  }

  drawFlash(ctx, width, height, p, tint)
}

/** Three expanding rings, thinning as they go. */
function drawShockwaves(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  spread: number,
  strength: number,
  tint: RGB,
): void {
  if (strength <= 0.01) return

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  for (let i = 0; i < 3; i++) {
    const offset = spread * (1.9 + i * 0.55) - i * 0.18
    const r = radius * (1 + offset)
    const alpha = strength * (0.42 - i * 0.11)
    if (alpha <= 0) continue

    ctx.strokeStyle = rgbToCss(tint, alpha)
    ctx.lineWidth = Math.max(1, radius * 0.05 * strength * (1 - i * 0.25))
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.restore()
}

/** Light forcing its way out from the middle of the doomed world. */
function drawCoreBreach(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  local: number,
  tint: RGB,
): void {
  const bloom = easeIn(local)
  if (bloom <= 0.005) return

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (0.2 + bloom * 1.1))
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.9 * bloom})`)
  glow.addColorStop(0.35, rgbToCss(tint, 0.7 * bloom))
  glow.addColorStop(1, rgbToCss(tint, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2)
  ctx.fill()

  // The tear itself, opening across the planet.
  const width = radius * 2.1 * bloom
  const thickness = Math.max(1, radius * 0.05 * (0.35 + bloom))
  const seam = ctx.createLinearGradient(cx - width / 2, cy, cx + width / 2, cy)
  seam.addColorStop(0, rgbToCss(tint, 0))
  seam.addColorStop(0.5, `rgba(255, 255, 255, ${0.95 * bloom})`)
  seam.addColorStop(1, rgbToCss(tint, 0))
  ctx.fillStyle = seam
  ctx.fillRect(cx - width / 2, cy - thickness / 2, width, thickness)

  ctx.restore()
}

/** A whiteout peaking exactly at the handover, so the swap is never seen. */
function drawFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  p: number,
  tint: RGB,
): void {
  const distance = Math.abs(p - HANDOVER) / HANDOVER
  const intensity = Math.pow(1 - clamp01(distance), 3)
  if (intensity <= 0.01) return

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = rgbToCss(
    [
      Math.round(255 - (255 - tint[0]) * 0.35),
      Math.round(255 - (255 - tint[1]) * 0.35),
      Math.round(255 - (255 - tint[2]) * 0.35),
    ],
    intensity * 0.92,
  )
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

/** Motion-free variant: the two worlds simply dissolve into each other. */
function drawCrossfade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: FractureFrame,
  p: number,
  tint: RGB,
): void {
  const { from, to, time } = frame

  if (p < HANDOVER) {
    drawPlanet(ctx, { ...from, instability: 1 }, width, height, {
      time,
      reducedMotion: true,
    })
  } else {
    drawPlanet(ctx, to, width, height, { time, reducedMotion: true })
  }

  const distance = Math.abs(p - HANDOVER) / HANDOVER
  const intensity = 1 - clamp01(distance)
  if (intensity <= 0.01) return

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = rgbToCss(tint, intensity * 0.75)
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
