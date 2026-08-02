import { useGame } from '@/game/GameProvider'
import { RESOURCES } from '@/content/resources'
import { totalChrononRate } from '@/engine/formulas'
import { resourceDrain, resourceNetRate, resourceRate } from '@/engine/world'
import { formatNumber, formatRate } from '@/lib/format'
import type { ResourceId } from '@/engine/types'

export function ResourceBar() {
  const game = useGame()
  const { active, legacies, meta } = game.state

  const visible: ResourceId[] = ['energy']
  if (active.stats.lifetime.matter > 0) visible.push('matter')
  if (active.stats.lifetime.alloy > 0) visible.push('alloy')

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
      {visible.map((id) => (
        <ResourceCell
          key={id}
          id={id}
          amount={active.resources[id]}
          net={resourceNetRate(active, id, game.mods)}
          gross={resourceRate(active, id, game.mods)}
          drain={resourceDrain(active, id)}
        />
      ))}

      {legacies.length > 0 && (
        <ResourceCell
          id="chronon"
          amount={meta.chronon}
          net={totalChrononRate(game.state, game.mods)}
          gross={totalChrononRate(game.state, game.mods)}
          drain={0}
        />
      )}
    </div>
  )
}

function ResourceCell({
  id,
  amount,
  net,
  gross,
  drain,
}: {
  id: ResourceId
  amount: number
  net: number
  gross: number
  drain: number
}) {
  const def = RESOURCES[id]
  const color = `var(${def.colorVar})`
  const starved = drain > 0 && net < 0

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2"
      title={def.blurb}
    >
      <div
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: color }}
        aria-hidden
      />
      <div
        className="text-[0.62rem] font-semibold tracking-[0.14em] uppercase"
        style={{ color }}
      >
        {def.name}
      </div>
      <div className="tnum mt-0.5 text-lg leading-tight font-semibold text-white/95">
        {formatNumber(amount)}
      </div>
      <div className="tnum text-xs text-white/45">
        <span className={starved ? 'text-red-300/80' : undefined}>{formatRate(net)}</span>
        {drain > 0 && (
          <span className="ml-1.5 text-white/25">
            {formatNumber(gross)} − {formatNumber(drain)}
          </span>
        )}
      </div>
    </div>
  )
}
