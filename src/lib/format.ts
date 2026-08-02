/**
 * Number presentation. Every displayed quantity goes through here, so the day
 * the engine swaps to a big-number type this file is the only place the UI
 * needs to change.
 */

const SUFFIXES = [
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
  'UDc',
  'DDc',
  'TDc',
]

/** Compact magnitude, e.g. 1.23M. Falls back to scientific past the suffixes. */
export function formatNumber(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return '∞'
  if (value === 0) return '0'

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)

  if (abs < 1) {
    // Small values need real precision — this is the early game.
    if (abs < 0.001) return sign + abs.toExponential(1)
    return sign + trimZeros(abs.toFixed(3))
  }

  if (abs < 1_000) {
    return sign + trimZeros(abs.toFixed(abs < 10 ? 2 : abs < 100 ? 1 : 0))
  }

  const tier = Math.floor(Math.log10(abs) / 3)
  if (tier < SUFFIXES.length) {
    const scaled = abs / Math.pow(1_000, tier)
    return sign + trimZeros(scaled.toFixed(precision)) + SUFFIXES[tier]
  }

  const exponent = Math.floor(Math.log10(abs))
  const mantissa = abs / Math.pow(10, exponent)
  return `${sign}${trimZeros(mantissa.toFixed(precision))}e${exponent}`
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/** Signed per-second rate, e.g. "+1.20M/s". */
export function formatRate(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${formatNumber(Math.abs(value))}/s`
}

export function formatPercent(fraction: number, precision = 0): string {
  return `${(fraction * 100).toFixed(precision)}%`
}

/** Coarse elapsed time, e.g. "2h 14m". Never shows more than two units. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`

  const minutes = Math.floor(s / 60)
  if (minutes < 60) {
    const rest = s % 60
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
  }

  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`
}

/**
 * Time until `target` is reachable at the current rate. Returns null when the
 * target is already met or nothing is being produced — the caller decides what
 * to show, rather than getting a misleading "∞".
 */
export function timeToTarget(current: number, target: number, rate: number): number | null {
  if (current >= target) return null
  if (rate <= 0) return null
  return (target - current) / rate
}

export function formatMultiplier(value: number): string {
  return `×${formatNumber(value, value < 10 ? 2 : 1)}`
}
