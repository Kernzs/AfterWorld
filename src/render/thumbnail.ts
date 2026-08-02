/**
 * One-shot renderer for the multiverse grid.
 *
 * Thumbnails are drawn once and left alone rather than animated. A grid of
 * thirty spinning planets would cost thirty render loops for something the
 * player is scanning, not watching — and the surface cache is shared with the
 * main view anyway, so the expensive part is already paid for.
 */

import type { PlanetVisualState } from '@/engine/types'
import { drawPlanet } from './planet'

/** Each world shows a different face, derived from its seed. */
function spinForSeed(seed: number): number {
  return ((seed >>> 8) % 1000) / 1000
}

export function renderThumbnail(
  canvas: HTMLCanvasElement,
  visual: PlanetVisualState,
  sizeCss: number,
  dpr = window.devicePixelRatio || 1,
): void {
  const pixels = Math.round(sizeCss * dpr)
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels
    canvas.height = pixels
  }
  canvas.style.width = `${sizeCss}px`
  canvas.style.height = `${sizeCss}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawPlanet(ctx, visual, sizeCss, sizeCss, {
    time: 0,
    reducedMotion: true,
    stars: false,
    spin: spinForSeed(visual.seed),
    scale: 0.38,
  })
}
