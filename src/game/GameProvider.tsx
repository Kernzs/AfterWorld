import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { Game, createGameState } from '@/engine/game'
import { load, save } from '@/engine/save'

const GameContext = createContext<Game | null>(null)

const AUTOSAVE_MS = 10_000

export function GameProvider({ children }: { children: ReactNode }) {
  const [game] = useState(() => new Game(load() ?? createGameState(Date.now())))

  // Credit time elapsed while the tab was closed. Safe under StrictMode's
  // double-invoke: the first call moves `lastSeenAt` to now, so the second
  // sees no elapsed time and returns early.
  useEffect(() => {
    game.applyOfflineTime(Date.now())
  }, [game])

  useGameLoop(game)
  useAutosave(game)

  return <GameContext.Provider value={game}>{children}</GameContext.Provider>
}

/** The Game instance, without subscribing to updates. For action handlers. */
export function useGameStatic(): Game {
  const game = useContext(GameContext)
  if (!game) throw new Error('useGameStatic must be used inside <GameProvider>')
  return game
}

/**
 * Subscribes to the store and returns the Game. State is mutable and read
 * directly off `game.state` — the version counter is what drives re-renders,
 * and it is bumped at ~10 Hz rather than every one of the 20 simulation ticks.
 */
export function useGame(): Game {
  const game = useGameStatic()
  useSyncExternalStore(game.subscribe, game.getVersion, game.getVersion)
  return game
}

/**
 * The simulation clock. Driven by requestAnimationFrame but decoupled from it:
 * the engine consumes elapsed time in fixed steps, so a 144 Hz display and a
 * throttled background tab produce the same result.
 */
function useGameLoop(game: Game): void {
  const frameRef = useRef(0)

  useEffect(() => {
    let running = true

    const frame = (now: number) => {
      if (!running) return
      game.runFrame(now)
      frameRef.current = requestAnimationFrame(frame)
    }

    frameRef.current = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(frameRef.current)
    }
  }, [game])
}

function useAutosave(game: Game): void {
  useEffect(() => {
    const persist = () => save(game.state)

    const interval = window.setInterval(persist, AUTOSAVE_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', persist)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', persist)
      persist()
    }
  }, [game])
}
