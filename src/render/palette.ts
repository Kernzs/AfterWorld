import type { EraId, OrientationId } from '@/engine/types'

export type RGB = readonly [number, number, number]

export interface Palette {
  /** Terrain ramp, from sea floor to peaks. */
  abyss: RGB
  shallow: RGB
  shore: RGB
  lowland: RGB
  upland: RGB
  peak: RGB
  /** Molten light bleeding through an unhealed crust. */
  molten: RGB
  vegetation: RGB
  city: RGB
  /** Atmospheric rim, as CSS. */
  rim: string
  halo: string
}

const ERA_PALETTES: Record<EraId, Palette> = {
  'dead-core': {
    abyss: [24, 18, 22],
    shallow: [38, 32, 38],
    shore: [58, 48, 46],
    lowland: [64, 56, 56],
    upland: [86, 78, 80],
    peak: [116, 110, 116],
    molten: [255, 122, 46],
    vegetation: [70, 92, 66],
    city: [255, 176, 96],
    rim: 'rgba(255, 132, 66, 0.30)',
    halo: 'rgba(255, 110, 50, 0.16)',
  },
  'first-matter': {
    abyss: [10, 30, 62],
    shallow: [26, 78, 128],
    shore: [116, 108, 88],
    lowland: [88, 84, 70],
    upland: [110, 102, 88],
    peak: [156, 152, 148],
    molten: [255, 138, 70],
    vegetation: [74, 132, 86],
    city: [255, 196, 120],
    rim: 'rgba(96, 176, 255, 0.34)',
    halo: 'rgba(70, 140, 255, 0.16)',
  },
  machines: {
    abyss: [8, 26, 54],
    shallow: [28, 84, 132],
    shore: [124, 124, 122],
    lowland: [96, 100, 100],
    upland: [126, 130, 134],
    peak: [178, 184, 192],
    molten: [255, 150, 80],
    vegetation: [86, 140, 96],
    city: [255, 214, 150],
    rim: 'rgba(140, 200, 255, 0.38)',
    halo: 'rgba(110, 170, 255, 0.18)',
  },
}

/** Frozen timelines carry the colour of the path they were locked into. */
const ORIENTATION_TINT: Record<OrientationId, RGB> = {
  industrial: [255, 139, 82],
  organic: [95, 217, 139],
  synthetic: [86, 183, 255],
  mystic: [201, 139, 255],
}

const ORIENTATION_RIM: Record<OrientationId, string> = {
  industrial: 'rgba(255, 139, 82, 0.40)',
  organic: 'rgba(95, 217, 139, 0.40)',
  synthetic: 'rgba(86, 183, 255, 0.42)',
  mystic: 'rgba(201, 139, 255, 0.44)',
}

const mixChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

function tint(color: RGB, target: RGB, amount: number): RGB {
  return [
    mixChannel(color[0], target[0], amount),
    mixChannel(color[1], target[1], amount),
    mixChannel(color[2], target[2], amount),
  ]
}

/**
 * The palette for a world, tinted toward its orientation once it has been
 * fractured. The tint is deliberately light — a Mystic world should read as a
 * violet-lit version of a real planet, not as a violet ball.
 */
export function paletteFor(era: EraId, orientation: OrientationId | null): Palette {
  const base = ERA_PALETTES[era]
  if (!orientation) return base

  const target = ORIENTATION_TINT[orientation]
  return {
    abyss: tint(base.abyss, target, 0.14),
    shallow: tint(base.shallow, target, 0.18),
    shore: tint(base.shore, target, 0.16),
    lowland: tint(base.lowland, target, 0.2),
    upland: tint(base.upland, target, 0.18),
    peak: tint(base.peak, target, 0.14),
    molten: base.molten,
    vegetation: tint(base.vegetation, target, 0.22),
    city: tint(base.city, target, 0.3),
    rim: ORIENTATION_RIM[orientation],
    halo: ORIENTATION_RIM[orientation].replace(/0\.4\d\)$/, '0.18)'),
  }
}

/** The colour a fractured timeline is remembered by. */
export function orientationTint(id: OrientationId): RGB {
  return ORIENTATION_TINT[id]
}

export function rgbToCss(color: RGB, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${color[0]}, ${color[1]}, ${color[2]})`
    : `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [mixChannel(a[0], b[0], t), mixChannel(a[1], b[1], t), mixChannel(a[2], b[2], t)]
}
