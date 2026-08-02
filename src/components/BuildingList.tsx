import { useState } from 'react'
import { useGame } from '@/game/GameProvider'
import { BUILDINGS, BUILDING_ORDER } from '@/content/buildings'
import { RESOURCES } from '@/content/resources'
import { buildingRate, bulkCost, currentTier, nextTier } from '@/engine/formulas'
import { resolveBuyQuantity, visibleBuildings } from '@/engine/world'
import { formatNumber, formatPercent } from '@/lib/format'
import { Button, EmptyState, Panel, ProgressBar } from './ui'
import { cn } from '@/lib/cn'
import type { BuildingId, ResourceId } from '@/engine/types'
import type { BuyAmount } from '@/engine/world'

const AMOUNTS: BuyAmount[] = [1, 10, 'max']

export function BuildingList() {
  const game = useGame()
  const [amount, setAmount] = useState<BuyAmount>(1)

  const unlocked = new Set(visibleBuildings(game.state.active))
  const ids = BUILDING_ORDER.filter((id) => unlocked.has(id))

  return (
    <Panel
      title="Construction"
      aside={
        <div className="flex gap-1" role="group" aria-label="Purchase quantity">
          {AMOUNTS.map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setAmount(value)}
              aria-pressed={amount === value}
              className={cn(
                'rounded px-1.5 py-0.5 text-[0.68rem] font-semibold transition-colors',
                amount === value
                  ? 'bg-white/85 text-void-950'
                  : 'text-white/45 hover:text-white/80',
              )}
            >
              {value === 'max' ? 'MAX' : `×${value}`}
            </button>
          ))}
        </div>
      }
    >
      {ids.length === 0 ? (
        <EmptyState>Pulse the core until you can afford something.</EmptyState>
      ) : (
        <ul className="divide-y divide-white/5">
          {ids.map((id) => (
            <BuildingRow key={id} id={id} amount={amount} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function BuildingRow({ id, amount }: { id: BuildingId; amount: BuyAmount }) {
  const game = useGame()
  const world = game.state.active
  const def = BUILDINGS[id]
  const state = world.buildings[id]

  const tier = currentTier(def, state.count)
  const upcoming = nextTier(def, state.count)
  const qty = resolveBuyQuantity(world, id, amount, game.mods)
  const cost = bulkCost(def, state.count, Math.max(qty, 1), game.mods)
  const costResource = RESOURCES[def.cost.resource]
  const affordable = qty > 0 && cost <= world.resources[def.cost.resource]

  const output = buildingRate(def, state.count, game.mods) * state.efficiency
  const starved = state.count > 0 && state.efficiency < 0.995

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-white/90">
              {tier.name}
            </h3>
            {state.count > 0 && (
              <span className="tnum shrink-0 text-xs text-white/40">×{state.count}</span>
            )}
          </div>

          <p className="mt-0.5 truncate text-xs text-white/35 italic">{tier.flavor}</p>

          <div className="tnum mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span style={{ color: `var(${RESOURCES[def.produces].colorVar})` }}>
              +{formatNumber(output)} {RESOURCES[def.produces].name.toLowerCase()}/s
            </span>
            {def.consumes &&
              (Object.keys(def.consumes) as ResourceId[]).map((res) => (
                <span key={res} className="text-white/30">
                  −{formatNumber((def.consumes?.[res] ?? 0) * state.count)}{' '}
                  {RESOURCES[res].name.toLowerCase()}/s
                </span>
              ))}
          </div>

          {starved && (
            <p className="mt-1 text-xs text-red-300/75">
              Running at {formatPercent(state.efficiency)} — not enough input.
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <Button
            variant={affordable ? 'primary' : 'outline'}
            disabled={!affordable}
            onClick={() => game.buy(id, amount)}
            className="min-w-[7.5rem]"
          >
            <span className="tnum">
              {qty > 1 ? `Build ×${qty}` : 'Build'}
            </span>
          </Button>
          <div
            className="tnum mt-1 text-xs"
            style={{ color: affordable ? `var(${costResource.colorVar})` : undefined }}
          >
            <span className={affordable ? undefined : 'text-white/30'}>
              {formatNumber(cost)} {costResource.name.toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {upcoming && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-baseline justify-between text-[0.68rem] text-white/30">
            <span>
              Next: <span className="text-white/50">{upcoming.name}</span>
            </span>
            <span className="tnum">
              {state.count} / {upcoming.at}
            </span>
          </div>
          <ProgressBar
            value={progressToTier(state.count, tier.at, upcoming.at)}
            color={`var(${RESOURCES[def.produces].colorVar})`}
            label={`Progress to ${upcoming.name}`}
          />
        </div>
      )}
    </li>
  )
}

function progressToTier(count: number, from: number, to: number): number {
  if (to <= from) return 1
  return (count - from) / (to - from)
}
