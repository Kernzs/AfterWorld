import { useGame } from '@/game/GameProvider'
import { UPGRADES } from '@/content/upgrades'
import { BUILDINGS } from '@/content/buildings'
import { RESOURCES } from '@/content/resources'
import { currentTier, isUnlocked } from '@/engine/formulas'
import { canAffordUpgrade } from '@/engine/world'
import { formatMultiplier, formatNumber, formatPercent } from '@/lib/format'
import { Button, EmptyState, Panel } from './ui'
import type { ResourceId, UpgradeDef, UpgradeEffect, World } from '@/engine/types'

export function UpgradePanel() {
  const game = useGame()
  const world = game.state.active

  const owned = new Set(world.upgrades)
  const available = UPGRADES.filter((u) => !owned.has(u.id) && isUnlocked(u.unlock, world))

  return (
    <Panel
      title="Research"
      aside={
        owned.size > 0 ? (
          <span className="tnum text-[0.68rem] text-white/30">
            {owned.size} adopted
          </span>
        ) : undefined
      }
    >
      {available.length === 0 ? (
        <EmptyState>
          Nothing new to adopt. Build more, and the options will follow.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-white/5">
          {available.map((upgrade) => (
            <UpgradeRow key={upgrade.id} upgrade={upgrade} world={world} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function UpgradeRow({ upgrade, world }: { upgrade: UpgradeDef; world: World }) {
  const game = useGame()
  const affordable = canAffordUpgrade(world, upgrade.id)

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-sm font-semibold text-white/90">{upgrade.name}</h3>
        <p className="mt-0.5 text-xs text-white/35 italic">{upgrade.blurb}</p>
        <p className="mt-1.5 text-xs font-medium text-emerald-300/80">
          {upgrade.effects.map(describeEffect).join(' · ')}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <Button
          variant={affordable ? 'primary' : 'outline'}
          disabled={!affordable}
          onClick={() => game.buyUpgrade(upgrade.id)}
        >
          Adopt
        </Button>
        <div className="tnum mt-1 space-x-2 text-xs">
          {(Object.keys(upgrade.cost) as ResourceId[]).map((res) => (
            <span
              key={res}
              className={affordable ? undefined : 'text-white/30'}
              style={affordable ? { color: `var(${RESOURCES[res].colorVar})` } : undefined}
            >
              {formatNumber(upgrade.cost[res] ?? 0)}
            </span>
          ))}
        </div>
      </div>
    </li>
  )
}

function describeEffect(effect: UpgradeEffect): string {
  switch (effect.kind) {
    case 'globalMult':
      return `${formatMultiplier(effect.mult)} all production`
    case 'resourceMult':
      return `${formatMultiplier(effect.mult)} ${RESOURCES[effect.resource].name.toLowerCase()}`
    case 'buildingMult': {
      const def = BUILDINGS[effect.building]
      return `${formatMultiplier(effect.mult)} ${currentTier(def, 0).name.toLowerCase()} line`
    }
    case 'costReduction':
      return `${formatPercent(1 - effect.factor)} cheaper ${BUILDINGS[
        effect.building
      ].tiers[0].name.toLowerCase()}s`
  }
}
