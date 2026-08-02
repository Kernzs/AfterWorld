import { useState } from 'react'
import { useGame } from '@/game/GameProvider'
import { pendingEvent } from '@/engine/events'
import { Button, Modal } from './ui'
import { cn } from '@/lib/cn'

/**
 * Deliberately not dismissable. The simulation keeps running behind it, so
 * nothing is lost by thinking — but the decision is the point of the event and
 * deferring it would drain it of weight.
 */
export function EventModal() {
  const game = useGame()
  const [selected, setSelected] = useState<string | null>(null)

  const event = pendingEvent(game.state.active)
  if (!event) return null

  const choice = event.choices.find((c) => c.id === selected) ?? null

  return (
    <Modal labelledBy="event-title" wide>
      <div className="p-5 sm:p-6">
        <p className="font-display text-[0.68rem] font-semibold tracking-[0.16em] text-white/35 uppercase">
          Timeline {game.state.active.index} · Decision
        </p>
        <h2
          id="event-title"
          className="mt-1.5 font-display text-xl font-semibold text-balance text-white"
        >
          {event.title}
        </h2>

        {event.body.split('\n\n').map((paragraph, i) => (
          <p key={i} className="mt-2.5 text-sm text-pretty text-white/60">
            {paragraph}
          </p>
        ))}

        <div className="mt-5 space-y-2">
          {event.choices.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(option.id)}
              aria-pressed={selected === option.id}
              className={cn(
                'w-full rounded-lg border px-4 py-3 text-left transition-colors duration-150',
                selected === option.id
                  ? 'border-white/30 bg-white/[0.06]'
                  : 'border-white/8 bg-white/[0.02] hover:border-white/18',
              )}
            >
              <h3 className="font-display text-sm font-semibold text-white/90">
                {option.label}
              </h3>
              <p className="mt-1 text-xs text-pretty text-white/50">{option.outcome}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            variant="primary"
            disabled={!choice}
            onClick={() => choice && game.resolveEvent(event.id, choice.id)}
          >
            {choice ? `Commit — ${choice.label}` : 'Choose one'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
