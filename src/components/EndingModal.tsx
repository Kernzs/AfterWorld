import { useGame } from '@/game/GameProvider'
import { ENDING_BODY, ENDING_FOOTER, ENDING_TITLE } from '@/content/convergence'
import { ORIENTATIONS } from '@/content/orientations'
import { totalChrononRate } from '@/engine/formulas'
import { formatDuration, formatNumber } from '@/lib/format'
import { Button, Modal } from './ui'

/** The reveal. Shown exactly once, when the multiverse converges. */
export function EndingModal() {
  const game = useGame()
  const { meta, legacies } = game.state

  if (meta.convergedAt === null || meta.endingSeen) return null

  const elapsed = (meta.convergedAt - game.state.createdAt) / 1000

  return (
    <Modal labelledBy="ending-title" wide>
      <div className="p-5 sm:p-7">
        <p className="font-display text-[0.68rem] font-semibold tracking-[0.16em] text-chronon/70 uppercase">
          The Convergence
        </p>
        <h2
          id="ending-title"
          className="mt-1.5 font-display text-2xl font-semibold text-balance text-white"
        >
          {ENDING_TITLE}
        </h2>

        {ENDING_BODY.map((paragraph, i) => (
          <p key={i} className="mt-3 text-sm text-pretty text-white/60">
            {paragraph}
          </p>
        ))}

        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Timelines" value={String(legacies.length)} />
          <Stat label="Elapsed" value={formatDuration(elapsed)} />
          <Stat
            label="Chronons/s"
            value={formatNumber(totalChrononRate(game.state, game.mods))}
          />
          <Stat label="Depth" value={String(deepest(legacies.map((l) => l.investLevel)))} />
        </dl>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {legacies.map((legacy) => (
            <span
              key={legacy.id}
              className="rounded-md px-2 py-1 text-[0.68rem] font-medium"
              style={{
                color: `var(${ORIENTATIONS[legacy.orientation].colorVar})`,
                background: `color-mix(in oklab, var(${
                  ORIENTATIONS[legacy.orientation].colorVar
                }) 12%, transparent)`,
              }}
            >
              T{legacy.index} · {ORIENTATIONS[legacy.orientation].name}
            </span>
          ))}
        </div>

        <p className="mt-5 text-xs text-pretty text-white/40 italic">{ENDING_FOOTER}</p>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={() => game.acknowledgeEnding()}>
            Keep going
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
      <dt className="text-[0.6rem] font-semibold tracking-[0.12em] text-white/35 uppercase">
        {label}
      </dt>
      <dd className="tnum text-sm font-semibold text-white/90">{value}</dd>
    </div>
  )
}

function deepest(levels: number[]): number {
  return levels.reduce((max, level) => Math.max(max, level), 0)
}
