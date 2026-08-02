import { useGame } from '@/game/GameProvider'
import { RESOURCES } from '@/content/resources'
import { OFFLINE_CAP_S } from '@/engine/game'
import { formatDuration, formatNumber } from '@/lib/format'
import { Button, Modal } from './ui'
import type { ResourceId } from '@/engine/types'

export function OfflineReport() {
  const game = useGame()
  const report = game.offlineReport
  if (!report) return null

  const close = () => game.dismissOfflineReport()
  const entries = (Object.keys(report.gains) as ResourceId[]).filter(
    (id) => (report.gains[id] ?? 0) > 0,
  )

  return (
    <Modal onClose={close} labelledBy="offline-title">
      <div className="p-5 sm:p-6">
        <h2
          id="offline-title"
          className="font-display text-lg font-semibold text-balance text-white"
        >
          It kept going without you
        </h2>
        <p className="mt-1.5 text-sm text-white/50">
          {formatDuration(report.seconds)} elapsed.
          {report.capped && ` Offline production stops accruing after ${formatDuration(OFFLINE_CAP_S)}.`}
        </p>

        <ul className="mt-4 space-y-1.5">
          {entries.map((id) => (
            <li
              key={id}
              className="flex items-baseline justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3.5 py-2"
            >
              <span
                className="text-xs font-semibold tracking-[0.12em] uppercase"
                style={{ color: `var(${RESOURCES[id].colorVar})` }}
              >
                {RESOURCES[id].name}
              </span>
              <span className="tnum text-sm font-semibold text-white/90">
                +{formatNumber(report.gains[id] ?? 0)}
              </span>
            </li>
          ))}

          {report.chronon > 0 && (
            <li className="flex items-baseline justify-between rounded-lg border border-chronon/20 bg-chronon/5 px-3.5 py-2">
              <span
                className="text-xs font-semibold tracking-[0.12em] uppercase"
                style={{ color: 'var(--color-chronon)' }}
              >
                Chronons
              </span>
              <span
                className="tnum text-sm font-semibold"
                style={{ color: 'var(--color-chronon)' }}
              >
                +{formatNumber(report.chronon)}
              </span>
            </li>
          )}

          {entries.length === 0 && report.chronon <= 0 && (
            <li className="px-1 py-2 text-sm text-white/35">
              Nothing was running. Build something that does not need you.
            </li>
          )}
        </ul>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={close}>
            Resume
          </Button>
        </div>
      </div>
    </Modal>
  )
}
