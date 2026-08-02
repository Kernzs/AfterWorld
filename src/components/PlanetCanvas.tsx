import { useEffect, useRef } from 'react'
import { useGameStatic } from '@/game/GameProvider'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { deriveVisual } from '@/engine/formulas'
import { drawPlanet } from '@/render/planet'
import { drawFracture, fractureDuration } from '@/render/fracture'

const PULSE_MS = 720

/**
 * The planet renders on its own requestAnimationFrame loop and reads engine
 * state directly. It never subscribes to React, so a 60 fps animation does not
 * drag the rest of the interface into 60 re-renders a second.
 */
export function PlanetCanvas({ onPulse }: { onPulse?: () => void }) {
  const game = useGameStatic()
  const reducedMotion = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const pulsesRef = useRef<number[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let frame = 0

    /**
     * Returns false when the wrapper has no size yet. Measuring during mount
     * can land before layout has settled, and a canvas sized from that reading
     * stays wrong forever — the element never resizes again, so the observer
     * has nothing to report. The render loop retries until a real size appears.
     */
    const resize = (): boolean => {
      const rect = wrap.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return false

      const dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return true
    }

    resize()
    const observer = new ResizeObserver(() => resize())
    observer.observe(wrap)

    const render = (time: number) => {
      if (width < 1 || height < 1) {
        if (!resize()) {
          frame = requestAnimationFrame(render)
          return
        }
      }

      const visual = deriveVisual(game.state.active)
      const transition = game.fractureTransition

      if (transition) {
        const progress = (time - transition.startedAt) / fractureDuration(reducedMotion)
        if (progress < 1) {
          drawFracture(ctx, width, height, {
            from: transition.from,
            to: visual,
            progress,
            time,
            reducedMotion,
          })
          frame = requestAnimationFrame(render)
          return
        }
        // Also the path taken when the tab was hidden through the whole thing.
        game.fractureTransition = null
      }

      drawPlanet(ctx, visual, width, height, { time, reducedMotion })
      drawPulses(ctx, width, height, time, pulsesRef.current, reducedMotion)
      frame = requestAnimationFrame(render)
    }

    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [game, reducedMotion])

  const handlePulse = () => {
    game.pulse()
    pulsesRef.current.push(performance.now())
    if (pulsesRef.current.length > 12) pulsesRef.current.shift()
    onPulse?.()
  }

  return (
    <div ref={wrapRef} className="bg-starfield relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
      <button
        type="button"
        onClick={handlePulse}
        className="absolute inset-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white/50"
      >
        <span className="sr-only">Pulse the core for energy</span>
      </button>
    </div>
  )
}

/** Expanding rings on each manual pulse — the only feedback a click gets. */
function drawPulses(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  pulses: number[],
  reducedMotion: boolean,
): void {
  if (pulses.length === 0) return

  while (pulses.length > 0 && time - pulses[0] > PULSE_MS) pulses.shift()
  if (reducedMotion) return

  const cx = width / 2
  const cy = height / 2
  const baseRadius = Math.min(width, height) * 0.33

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const started of pulses) {
    const t = (time - started) / PULSE_MS
    if (t < 0 || t > 1) continue
    const eased = 1 - Math.pow(1 - t, 2)
    ctx.strokeStyle = `rgba(77, 216, 255, ${0.5 * (1 - t)})`
    ctx.lineWidth = 2 * (1 - t) + 0.5
    ctx.beginPath()
    ctx.arc(cx, cy, baseRadius * (0.35 + eased * 0.9), 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}
