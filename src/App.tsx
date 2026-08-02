import { useState } from 'react'
import { GameProvider, useGame } from '@/game/GameProvider'
import { ERAS } from '@/content/eras'
import { formatDuration, formatMultiplier } from '@/lib/format'
import { PlanetCanvas } from '@/components/PlanetCanvas'
import { ResourceBar } from '@/components/ResourceBar'
import { BuildingList } from '@/components/BuildingList'
import { UpgradePanel } from '@/components/UpgradePanel'
import { FracturePanel } from '@/components/FracturePanel'
import { MultiverseView } from '@/components/MultiverseView'
import { EventModal } from '@/components/EventModal'
import { EndingModal } from '@/components/EndingModal'
import { OfflineReport } from '@/components/OfflineReport'
import { SettingsModal } from '@/components/SettingsModal'
import { DevPanel } from '@/components/DevPanel' // dev only — see DevPanel.tsx to remove
import { cn } from '@/lib/cn'

type Tab = 'build' | 'multiverse'

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('build')
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar tab={tab} onTab={setTab} onSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto grid w-full max-w-[1500px] flex-1 gap-4 px-3 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,460px)] lg:px-4">
        <div className="relative min-h-[300px] overflow-hidden rounded-xl border border-white/8 lg:sticky lg:top-[4.25rem] lg:h-[calc(100dvh-5.5rem)] lg:min-h-0">
          <PlanetCanvas />
          <EraCaption />
        </div>

        <div className="min-w-0 space-y-3 pb-4">
          <ResourceBar />

          {tab === 'build' ? (
            <>
              <BuildingList />
              <UpgradePanel />
              <FracturePanel />
            </>
          ) : (
            <MultiverseView />
          )}
        </div>
      </main>

      <EventModal />
      <EndingModal />
      <OfflineReport />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {import.meta.env.DEV && <DevPanel />}
    </div>
  )
}

function TopBar({
  tab,
  onTab,
  onSettings,
}: {
  tab: Tab
  onTab: (tab: Tab) => void
  onSettings: () => void
}) {
  const game = useGame()
  const { active, legacies } = game.state

  return (
    <header className="sticky top-0 z-30 mb-3 border-b border-white/6 bg-void-950/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 px-3 py-2.5 lg:px-4">
        <h1 className="font-display text-sm font-semibold tracking-[0.12em] text-white/85 uppercase">
          After<span className="text-white/40">World</span>
        </h1>

        <span className="hidden text-xs text-white/30 sm:inline">
          Timeline {active.index} · {ERAS[active.era].name} ·{' '}
          {formatDuration(active.stats.elapsed)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {game.mods.global > 1.001 && (
            <span
              className="tnum mr-1 hidden text-xs text-emerald-300/70 sm:inline"
              title="Total production multiplier from research, events and frozen timelines"
            >
              {formatMultiplier(game.mods.global)}
            </span>
          )}

          <nav className="flex rounded-lg bg-white/5 p-0.5" aria-label="Sections">
            <TabButton active={tab === 'build'} onClick={() => onTab('build')}>
              Planet
            </TabButton>
            <TabButton active={tab === 'multiverse'} onClick={() => onTab('multiverse')}>
              Multiverse
              {legacies.length > 0 && (
                <span className="tnum ml-1.5 text-[0.65rem] opacity-60">
                  {legacies.length}
                </span>
              )}
            </TabButton>
          </nav>

          <button
            type="button"
            onClick={onSettings}
            aria-label="Save data"
            className="rounded-lg px-2 py-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-white/90 text-void-950' : 'text-white/50 hover:text-white/85',
      )}
    >
      {children}
    </button>
  )
}

/** Era name and its one-line framing, over the planet. */
function EraCaption() {
  const game = useGame()
  const era = ERAS[game.state.active.era]

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-void-950/80 to-transparent p-4 pt-10">
      <p className="font-display text-[0.68rem] font-semibold tracking-[0.16em] text-white/40 uppercase">
        Era {era.index + 1}
      </p>
      <h2 className="font-display text-lg font-semibold text-white/90">{era.name}</h2>
      <p className="mt-0.5 max-w-md text-xs text-pretty text-white/45">{era.blurb}</p>
    </div>
  )
}
