import { useGame } from '@/game/GameProvider'
import { ORIENTATIONS } from '@/content/orientations'
import {
  CONVERGENCE_BLURB,
  CONVERGENCE_TITLE,
} from '@/content/convergence'
import { canConverge, convergenceProgress, convergenceStatus } from '@/engine/convergence'
import { Button, Panel, ProgressBar } from './ui'
import { cn } from '@/lib/cn'
import type { ConvergenceSlot } from '@/engine/convergence'

/**
 * The destination, visible from the first fracture onward. Shown before it is
 * reachable on purpose: a goal the player cannot see is not a goal.
 */
export function ConvergencePanel() {
  const game = useGame()
  const status = convergenceStatus(game.state)
  const ready = canConverge(game.state)
  const progress = convergenceProgress(status)

  return (
    <Panel
      title={CONVERGENCE_TITLE}
      aside={
        <span className="tnum text-[0.68rem] text-white/35">
          {status.met} / {status.total}
        </span>
      }
    >
      <div className="px-4 py-3">
        {status.converged ? (
          <p className="text-xs text-pretty text-white/45">
            Your multiverse has converged. Everything below still runs — it simply
            answers to something larger now.
          </p>
        ) : (
          <p className="text-xs text-pretty text-white/45">{CONVERGENCE_BLURB}</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {status.slots.map((slot) => (
            <SlotCard key={slot.orientation} slot={slot} required={status.requiredDepth} />
          ))}
        </div>

        {!status.converged && (
          <>
            <ProgressBar
              value={progress}
              color="var(--color-chronon)"
              className="mt-3"
              label="Progress toward the Convergence"
            />

            <Button
              variant={ready ? 'primary' : 'outline'}
              disabled={!ready}
              onClick={() => game.converge()}
              className="mt-3 w-full"
            >
              {ready
                ? 'Bring them into phase'
                : `${status.total - status.met} path${
                    status.total - status.met === 1 ? '' : 's'
                  } still missing`}
            </Button>
          </>
        )}
      </div>
    </Panel>
  )
}

function SlotCard({ slot, required }: { slot: ConvergenceSlot; required: number }) {
  const def = ORIENTATIONS[slot.orientation]
  const color = `var(${def.colorVar})`

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 transition-colors',
        slot.ready ? 'border-white/20 bg-white/[0.05]' : 'border-white/8 bg-white/[0.02]',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn('h-1.5 w-1.5 rounded-full', !slot.legacy && 'opacity-30')}
          style={{ background: color }}
          aria-hidden
        />
        <span
          className="font-display text-xs font-semibold"
          style={{ color: slot.legacy ? color : 'rgba(255,255,255,0.35)' }}
        >
          {def.name}
        </span>
        {slot.ready && (
          <span className="ml-auto text-xs text-emerald-300/80" aria-label="ready">
            ✓
          </span>
        )}
      </div>

      <p className="tnum mt-1 text-[0.7rem] text-white/40">
        {slot.legacy ? (
          <>
            Timeline {slot.legacy.index} · depth {slot.depth}
            {!slot.ready && <span className="text-white/25"> / {required}</span>}
          </>
        ) : (
          <span className="text-white/25">No timeline yet</span>
        )}
      </p>
    </div>
  )
}
