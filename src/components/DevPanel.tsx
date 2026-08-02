/**
 * Development-only shortcuts. Not part of the game.
 *
 * TO REMOVE: delete this file, then delete the two lines that mention DevPanel
 * in src/App.tsx. Nothing else references it.
 *
 * It is already excluded from production builds — App.tsx renders it behind
 * `import.meta.env.DEV`, so Vite drops the whole module when bundling. Leaving
 * it in place ships nothing.
 *
 * Everything here mutates engine state directly and then calls `game.refresh()`
 * rather than going through player actions, which is exactly why it does not
 * belong in the shipped game.
 */

import { useState } from 'react'
import { useGame } from '@/game/GameProvider'
import { BUILDINGS, BUILDING_ORDER } from '@/content/buildings'
import { ERAS, ERA_ORDER, FRACTURE_REQUIREMENT } from '@/content/eras'
import { EVENTS } from '@/content/events'
import { CONVERGENCE_DEPTH, CONVERGENCE_ORIENTATIONS } from '@/content/convergence'
import { clearSave } from '@/engine/save'
import { isUnlocked } from '@/engine/formulas'
import { formatDuration, formatNumber } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { EraId, ResourceId } from '@/engine/types'

const GRANTS: Array<{ label: string; amount: number }> = [
  { label: '+1K', amount: 1e3 },
  { label: '+1M', amount: 1e6 },
  { label: '+1B', amount: 1e9 },
]

const SKIPS: Array<{ label: string; seconds: number }> = [
  { label: '1 min', seconds: 60 },
  { label: '10 min', seconds: 600 },
  { label: '1 h', seconds: 3_600 },
]

export function DevPanel() {
  const game = useGame()
  const [open, setOpen] = useState(false)
  const world = game.state.active

  /** Grants stock *and* lifetime, since most unlocks key off lifetime totals. */
  const grant = (amount: number) => {
    for (const id of ['energy', 'matter', 'alloy'] as ResourceId[]) {
      world.resources[id] += amount
      world.stats.lifetime[id] += amount
    }
    game.refresh()
  }

  const skip = (seconds: number) => {
    game.catchUp(seconds)
    game.refresh()
  }

  const jumpToEra = (era: EraId) => {
    // Meet every entry threshold up to and including the target.
    for (const id of ERA_ORDER) {
      const entry = ERAS[id].entry
      if (entry) {
        world.stats.lifetime[entry.resource] = Math.max(
          world.stats.lifetime[entry.resource],
          entry.amount,
        )
      }
      if (id === era) break
    }
    world.era = era
    game.refresh()
  }

  const makeFractureReady = () => {
    world.stats.lifetime[FRACTURE_REQUIREMENT.resource] = Math.max(
      world.stats.lifetime[FRACTURE_REQUIREMENT.resource],
      FRACTURE_REQUIREMENT.amount,
    )
    game.refresh()
  }

  const addBuildings = (count: number) => {
    for (const id of BUILDING_ORDER) {
      if (isUnlocked(BUILDINGS[id].unlock, world)) world.buildings[id].count += count
    }
    game.refresh()
  }

  const triggerEvent = (id: string) => {
    delete world.eventChoices[id]
    world.pendingEvent = id
    game.refresh()
  }

  /**
   * Fractures through every missing orientation and deepens everything to the
   * Convergence requirement. Goes through the real fracture path so the frozen
   * profiles are genuine, just reached in one click instead of five hours.
   */
  const fillMultiverse = () => {
    for (const orientation of CONVERGENCE_ORIENTATIONS) {
      if (game.state.legacies.some((legacy) => legacy.orientation === orientation)) continue
      grant(1e9)
      addBuildings(30)
      game.fracture(orientation)
    }
    for (const legacy of game.state.legacies) {
      legacy.investLevel = Math.max(legacy.investLevel, CONVERGENCE_DEPTH)
    }
    game.refresh()
  }

  /** Rewinds the clock and replays the return, so the offline report can be seen. */
  const simulateAbsence = (hours: number) => {
    game.state.lastSeenAt = Date.now() - hours * 3_600_000
    game.applyOfflineTime(Date.now())
  }

  const wipe = () => {
    clearSave()
    game.hardReset()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-40 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 font-mono text-[0.65rem] font-bold tracking-widest text-amber-200/80 uppercase backdrop-blur transition-colors hover:bg-amber-400/20"
      >
        Dev
      </button>
    )
  }

  return (
    <aside className="fixed bottom-3 left-3 z-40 w-[19rem] rounded-xl border border-amber-400/30 bg-void-900/95 p-3 shadow-2xl shadow-black/60 backdrop-blur">
      <header className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[0.65rem] font-bold tracking-widest text-amber-300/80 uppercase">
          Dev · not shipped
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-1.5 text-white/40 hover:text-white"
          aria-label="Close dev panel"
        >
          ×
        </button>
      </header>

      <p className="tnum mb-2.5 font-mono text-[0.65rem] leading-relaxed text-white/40">
        T{world.index} · {ERAS[world.era].name} · {formatDuration(world.stats.elapsed)}
        <br />
        ×{formatNumber(game.mods.global)} global · {game.state.legacies.length} frozen ·{' '}
        {formatNumber(game.state.meta.chronon)} chronons
      </p>

      <Row label="Grant all">
        {GRANTS.map((g) => (
          <Btn key={g.label} onClick={() => grant(g.amount)}>
            {g.label}
          </Btn>
        ))}
      </Row>

      <Row label="Skip time">
        {SKIPS.map((s) => (
          <Btn key={s.label} onClick={() => skip(s.seconds)}>
            {s.label}
          </Btn>
        ))}
      </Row>

      <Row label="Buildings">
        <Btn onClick={() => addBuildings(10)}>+10 each</Btn>
        <Btn onClick={() => addBuildings(25)}>+25 each</Btn>
      </Row>

      <Row label="Jump to era">
        {ERA_ORDER.map((id) => (
          <Btn key={id} onClick={() => jumpToEra(id)} active={world.era === id}>
            {ERAS[id].name}
          </Btn>
        ))}
      </Row>

      <Row label="Shortcuts">
        <Btn onClick={makeFractureReady}>Fracture ready</Btn>
        <Btn onClick={fillMultiverse}>Fill multiverse</Btn>
        <Btn onClick={() => (game.state.meta.chronon += 10_000, game.refresh())}>
          +10K chronons
        </Btn>
      </Row>

      <Row label="Come back">
        <Btn onClick={() => simulateAbsence(1)}>after 1 h</Btn>
        <Btn onClick={() => simulateAbsence(12)}>after 12 h</Btn>
      </Row>

      <Row label="Replay event">
        {EVENTS.map((event) => (
          <Btn key={event.id} onClick={() => triggerEvent(event.id)}>
            {event.id}
          </Btn>
        ))}
      </Row>

      <div className="mt-2.5 border-t border-white/8 pt-2.5">
        <button
          type="button"
          onClick={wipe}
          className="w-full rounded-md border border-red-400/30 px-2 py-1 font-mono text-[0.65rem] text-red-200/80 transition-colors hover:bg-red-500/10"
        >
          Wipe save and restart
        </button>
      </div>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="w-[4.6rem] shrink-0 font-mono text-[0.62rem] text-white/35">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Btn({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-1.5 py-0.5 font-mono text-[0.65rem] transition-colors',
        active
          ? 'bg-amber-300/80 text-void-950'
          : 'bg-white/6 text-white/70 hover:bg-white/14 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}
