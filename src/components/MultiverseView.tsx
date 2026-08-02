import { useEffect, useRef } from 'react'
import { useGame } from '@/game/GameProvider'
import { ORIENTATIONS, investCost } from '@/content/orientations'
import { RESOURCES } from '@/content/resources'
import { legacyChrononRate, totalChrononRate } from '@/engine/formulas'
import { renderThumbnail } from '@/render/thumbnail'
import { formatNumber } from '@/lib/format'
import { Button, EmptyState, Panel, Tag } from './ui'
import { ConvergencePanel } from './ConvergencePanel'
import type { LegacyWorld, ResourceId } from '@/engine/types'

export function MultiverseView() {
  const game = useGame()
  const { legacies, meta } = game.state

  return (
    <div className="space-y-3">
      <ConvergencePanel />

      <Panel
        title="Chronons"
        aside={
          <span
            className="tnum text-xs font-semibold"
            style={{ color: 'var(--color-chronon)' }}
          >
            +{formatNumber(totalChrononRate(game.state, game.mods))}/s
          </span>
        }
      >
        <div className="px-4 py-3">
          <div
            className="tnum text-2xl font-semibold"
            style={{ color: 'var(--color-chronon)' }}
          >
            {formatNumber(meta.chronon)}
          </div>
          <p className="mt-1 text-xs text-pretty text-white/40">
            Bled off by every timeline you have fractured, whether or not you are looking
            at them. Spend it deepening those timelines.
          </p>
        </div>
      </Panel>

      {legacies.length === 0 ? (
        <Panel title="Timelines">
          <EmptyState>
            No timelines fractured yet. The first one will keep producing here while you
            rebuild the next world.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {legacies.map((legacy) => (
            <LegacyCard key={legacy.id} legacy={legacy} />
          ))}
        </div>
      )}
    </div>
  )
}

const THUMB_SIZE = 84

function LegacyCard({ legacy }: { legacy: LegacyWorld }) {
  const game = useGame()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // The visual is frozen at fracture, so this renders once and never again.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) renderThumbnail(canvas, legacy.visual, THUMB_SIZE)
  }, [legacy.visual])

  const orientation = ORIENTATIONS[legacy.orientation]
  const color = `var(${orientation.colorVar})`
  const rate = legacyChrononRate(legacy, game.mods)
  const cost = investCost(legacy.investLevel)
  const affordable = game.state.meta.chronon >= cost

  return (
    <article className="rounded-xl border border-white/8 bg-white/[0.025] p-3.5">
      <div className="flex gap-3.5">
        <canvas
          ref={canvasRef}
          className="shrink-0 rounded-lg"
          style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-white/90">
              Timeline {legacy.index}
            </h3>
            <Tag color={color}>{orientation.name}</Tag>
          </div>

          <p className="mt-1 text-xs text-white/35 italic">{orientation.blurb}</p>

          <div
            className="tnum mt-2 text-base font-semibold"
            style={{ color: 'var(--color-chronon)' }}
          >
            +{formatNumber(rate)} chronons/s
          </div>

          <div className="tnum mt-0.5 flex flex-wrap gap-x-2.5 text-[0.7rem] text-white/30">
            {(['energy', 'matter', 'alloy'] as ResourceId[]).map((res) => {
              const value = legacy.profile[res] ?? 0
              if (value <= 0) return null
              return (
                <span key={res}>
                  {formatNumber(value)} {RESOURCES[res].name.toLowerCase()}/s
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/6 pt-3">
        <div className="text-xs">
          <div className="text-white/50">
            Depth <span className="tnum text-white/80">{legacy.investLevel}</span>
          </div>
          <div className="text-[0.7rem] text-white/30">{describeNextLevel(legacy)}</div>
        </div>

        <Button
          variant={affordable ? 'primary' : 'outline'}
          disabled={!affordable}
          onClick={() => game.invest(legacy.id)}
        >
          <span className="tnum">Deepen · {formatNumber(cost)}</span>
        </Button>
      </div>
    </article>
  )
}

function describeNextLevel(legacy: LegacyWorld): string {
  const orientation = ORIENTATIONS[legacy.orientation]
  const boon = orientation.boon
  const next = boon.perLevel * (2 + legacy.investLevel)
  const pct = `${(next * 100).toFixed(1)}%`

  switch (boon.kind) {
    case 'resourceMult':
      return `Next: ×1.6 output, +${pct} ${RESOURCES[boon.resource].name.toLowerCase()}`
    case 'globalMult':
      return `Next: ×1.6 output, +${pct} all production`
    case 'costReduction':
      return `Next: ×1.6 output, −${pct} build costs`
    case 'chrononMult':
      return `Next: ×1.6 output, +${pct} chronons everywhere`
  }
}
