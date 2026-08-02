import { useState } from 'react'
import { useGame } from '@/game/GameProvider'
import { FRACTURE_REQUIREMENT } from '@/content/eras'
import { ORIENTATIONS } from '@/content/orientations'
import { RESOURCES } from '@/content/resources'
import { canFracture, fractureProgress } from '@/engine/formulas'
import { availableOrientations, previewFracture } from '@/engine/legacy'
import { convergenceStatus } from '@/engine/convergence'
import { formatNumber, formatPercent } from '@/lib/format'
import { Button, Modal, Panel, ProgressBar } from './ui'
import { cn } from '@/lib/cn'
import type { Boon, OrientationId, ResourceId } from '@/engine/types'

export function FracturePanel() {
  const game = useGame()
  const [open, setOpen] = useState(false)
  const world = game.state.active

  const ready = canFracture(world)
  const progress = fractureProgress(world)
  const requirement = RESOURCES[FRACTURE_REQUIREMENT.resource]

  return (
    <>
      <Panel title="Temporal Stress">
        <div className="px-4 py-3">
          <p className="text-xs text-balance text-white/45">
            {ready
              ? 'The timeline will not hold. Fracture it, and this world keeps running without you.'
              : 'Push this world far enough and its timeline will split. The old one does not end — it keeps producing.'}
          </p>

          <div className="mt-3 mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-white/40">
              Lifetime {requirement.name.toLowerCase()}
            </span>
            <span className="tnum text-white/60">
              {formatNumber(world.stats.lifetime[FRACTURE_REQUIREMENT.resource])} /{' '}
              {formatNumber(FRACTURE_REQUIREMENT.amount)}
            </span>
          </div>
          <ProgressBar
            value={progress}
            color="var(--color-chronon)"
            label="Progress to fracture"
          />

          <Button
            variant={ready ? 'primary' : 'outline'}
            disabled={!ready}
            onClick={() => setOpen(true)}
            className="mt-3 w-full"
          >
            {ready ? 'Fracture the timeline' : `${formatPercent(progress, 1)} to fracture`}
          </Button>
        </div>
      </Panel>

      {open && <FractureModal onClose={() => setOpen(false)} />}
    </>
  )
}

function FractureModal({ onClose }: { onClose: () => void }) {
  const game = useGame()
  const world = game.state.active
  const options = availableOrientations(world)
  const [selected, setSelected] = useState<OrientationId | null>(options[0] ?? null)

  const preview = selected ? previewFracture(game.state, game.mods, selected) : null

  // The Convergence needs one of every path, so which ones are still absent is
  // the single most useful thing to know while choosing.
  const missingOrientations = new Set(
    convergenceStatus(game.state)
      .slots.filter((slot) => slot.legacy === null)
      .map((slot) => slot.orientation),
  )

  const confirm = () => {
    if (!selected) return
    game.fracture(selected)
    onClose()
  }

  return (
    <Modal onClose={onClose} labelledBy="fracture-title" wide>
      <div className="p-5 sm:p-6">
        <h2
          id="fracture-title"
          className="font-display text-xl font-semibold text-balance text-white"
        >
          Fracture Timeline {world.index}
        </h2>
        <p className="mt-2 text-sm text-pretty text-white/55">
          This world stops being yours to steer and becomes a fixed thing that produces
          forever. What it produces, and what it gives every timeline after it, is decided
          now and cannot be changed.
        </p>

        <div className="mt-5">
          <h3 className="font-display text-[0.7rem] font-semibold tracking-[0.14em] text-white/45 uppercase">
            Output being frozen
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['energy', 'matter', 'alloy'] as ResourceId[]).map((res) => (
              <div
                key={res}
                className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2"
              >
                <div
                  className="text-[0.6rem] font-semibold tracking-[0.12em] uppercase"
                  style={{ color: `var(${RESOURCES[res].colorVar})` }}
                >
                  {RESOURCES[res].name}
                </div>
                <div className="tnum text-sm font-semibold text-white/90">
                  {formatNumber(preview?.profile[res] ?? 0)}/s
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <h3 className="font-display text-[0.7rem] font-semibold tracking-[0.14em] text-white/45 uppercase">
            Choose what this world becomes
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((id) => (
              <OrientationCard
                key={id}
                id={id}
                selected={selected === id}
                missing={missingOrientations.has(id)}
                onSelect={() => setSelected(id)}
              />
            ))}
          </div>

          {options.length < 4 && (
            <p className="mt-2 text-xs text-white/30">
              Paths not listed were closed by decisions made in this timeline.
            </p>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-chronon/20 bg-chronon/5 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-white/60">
              This timeline will then produce
            </span>
            <span
              className="tnum text-lg font-semibold"
              style={{ color: 'var(--color-chronon)' }}
            >
              +{formatNumber(preview?.chrononRate ?? 0)} chronons/s
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Not yet
          </Button>
          <Button variant="primary" disabled={!selected} onClick={confirm}>
            Fracture — this cannot be undone
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function OrientationCard({
  id,
  selected,
  missing,
  onSelect,
}: {
  id: OrientationId
  selected: boolean
  missing: boolean
  onSelect: () => void
}) {
  const def = ORIENTATIONS[id]
  const color = `var(${def.colorVar})`

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-lg border px-3.5 py-3 text-left transition-colors duration-150',
        selected
          ? 'border-white/30 bg-white/[0.06]'
          : 'border-white/8 bg-white/[0.02] hover:border-white/18',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
        <h4 className="font-display text-sm font-semibold" style={{ color }}>
          {def.name}
        </h4>
        {missing && (
          <span className="ml-auto rounded bg-chronon/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-chronon uppercase">
            Not yet yours
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-white/40 italic">{def.blurb}</p>
      <p className="mt-1.5 text-xs text-pretty text-white/60">{def.consequence}</p>
      <p className="mt-1.5 text-[0.7rem] font-medium text-white/40">
        {describeBoon(def.boon)}
      </p>
    </button>
  )
}

function describeBoon(boon: Boon): string {
  const pct = formatPercent(boon.perLevel, 1)
  switch (boon.kind) {
    case 'resourceMult':
      return `+${pct} ${RESOURCES[boon.resource].name.toLowerCase()} per invest level`
    case 'globalMult':
      return `+${pct} all production per invest level`
    case 'costReduction':
      return `−${pct} build costs per invest level`
    case 'chrononMult':
      return `+${pct} chronons from every timeline per invest level`
  }
}
