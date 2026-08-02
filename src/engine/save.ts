import { BUILDINGS } from '@/content/buildings'
import { RESOURCE_IDS } from '@/content/resources'
import { UPGRADES_BY_ID } from '@/content/upgrades'
import { BASE_ORIENTATIONS, ORIENTATIONS } from '@/content/orientations'
import { SAVE_VERSION, createGameState } from './game'
import { nextSeed } from './legacy'
import { createWorld } from './world'
import type {
  BuildingId,
  GameState,
  LegacyWorld,
  OrientationId,
  ResourceId,
  World,
} from './types'

export const STORAGE_KEY = 'afterworld.save.v1'

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export function serialize(state: GameState): string {
  return JSON.stringify({ ...state, version: SAVE_VERSION })
}

/**
 * Persists as-is. Deliberately does *not* stamp `lastSeenAt`: that field means
 * "the moment the simulation has been advanced to", and only the tick loop is
 * entitled to move it.
 *
 * Stamping it here loses time. A hidden tab stops receiving animation frames,
 * so the simulation freezes — but the visibilitychange handler still fires a
 * save. Moving `lastSeenAt` to now would mark that frozen stretch as already
 * simulated, and the player would be quietly robbed of every hour spent with
 * the tab open in the background.
 */
export function save(state: GameState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state))
    return true
  } catch {
    // Quota exceeded or storage disabled. The game stays playable in memory;
    // failing loudly here would interrupt play for something the player
    // cannot act on mid-session.
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback

function reviveResources(raw: unknown): Record<ResourceId, number> {
  const source = (raw ?? {}) as Record<string, unknown>
  const out = {} as Record<ResourceId, number>
  for (const id of RESOURCE_IDS) out[id] = Math.max(0, num(source[id]))
  return out
}

/**
 * Rebuilds a world by merging saved fields onto a fresh one. Content added
 * after a save was written (a new building, a new resource) simply arrives at
 * its default instead of coming back `undefined` and poisoning the arithmetic.
 */
function reviveWorld(raw: unknown, fallbackSeed: number, now: number): World {
  const source = (raw ?? {}) as Record<string, unknown>
  const world = createWorld(
    num(source.seed, fallbackSeed) || fallbackSeed,
    num(source.index, 1) || 1,
    now,
  )

  world.id = str(source.id, world.id)
  world.era = str(source.era, 'dead-core') as World['era']
  world.resources = reviveResources(source.resources)

  const savedBuildings = (source.buildings ?? {}) as Record<string, unknown>
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const entry = (savedBuildings[id] ?? {}) as Record<string, unknown>
    world.buildings[id] = {
      count: Math.max(0, Math.floor(num(entry.count))),
      efficiency: 1,
    }
  }

  const savedUpgrades = Array.isArray(source.upgrades) ? source.upgrades : []
  world.upgrades = savedUpgrades.filter(
    (id): id is string => typeof id === 'string' && id in UPGRADES_BY_ID,
  )

  const savedStats = (source.stats ?? {}) as Record<string, unknown>
  world.stats = {
    lifetime: reviveResources(savedStats.lifetime),
    startedAt: num(savedStats.startedAt, now),
    elapsed: num(savedStats.elapsed),
  }

  const savedChoices = (source.eventChoices ?? {}) as Record<string, unknown>
  world.eventChoices = {}
  for (const [key, value] of Object.entries(savedChoices)) {
    if (typeof value === 'string') world.eventChoices[key] = value
  }

  world.pendingEvent = typeof source.pendingEvent === 'string' ? source.pendingEvent : null

  const savedMods = (source.eventMods ?? {}) as Record<string, unknown>
  const perResource: Partial<Record<ResourceId, number>> = {}
  const savedPerResource = (savedMods.perResource ?? {}) as Record<string, unknown>
  for (const id of RESOURCE_IDS) {
    const value = num(savedPerResource[id], 1)
    if (value !== 1) perResource[id] = value
  }
  world.eventMods = {
    global: num(savedMods.global, 1) || 1,
    perResource,
    profile: num(savedMods.profile, 1) || 1,
  }

  world.orientationsUnlocked = reviveOrientations(source.orientationsUnlocked, BASE_ORIENTATIONS)
  world.orientationsLocked = reviveOrientations(source.orientationsLocked, [])

  return world
}

function reviveOrientations(raw: unknown, fallback: OrientationId[]): OrientationId[] {
  if (!Array.isArray(raw)) return [...fallback]
  const valid = raw.filter(
    (id): id is OrientationId => typeof id === 'string' && id in ORIENTATIONS,
  )
  return valid.length > 0 || raw.length === 0 ? valid : [...fallback]
}

function reviveLegacy(raw: unknown, now: number): LegacyWorld | null {
  const source = (raw ?? {}) as Record<string, unknown>
  const orientation = str(source.orientation, '') as OrientationId
  if (!(orientation in ORIENTATIONS)) return null

  const seed = num(source.seed, 1) || 1
  const index = num(source.index, 1) || 1

  const savedProfile = (source.profile ?? {}) as Record<string, unknown>
  const profile: Partial<Record<ResourceId, number>> = {}
  for (const id of RESOURCE_IDS) {
    const value = num(savedProfile[id])
    if (value > 0) profile[id] = value
  }

  const savedVisual = (source.visual ?? {}) as Record<string, unknown>

  return {
    id: str(source.id, `w${index}-${seed.toString(36)}`),
    seed,
    index,
    name: str(source.name, `Timeline ${index} — ${ORIENTATIONS[orientation].name}`),
    orientation,
    era: str(source.era, 'machines') as LegacyWorld['era'],
    profile,
    chrononBase: Math.max(0, num(source.chrononBase)),
    investLevel: Math.max(0, Math.floor(num(source.investLevel))),
    visual: {
      seed,
      era: str(savedVisual.era, 'machines') as LegacyWorld['era'],
      terraform: num(savedVisual.terraform),
      ocean: num(savedVisual.ocean),
      biomass: num(savedVisual.biomass),
      civilization: num(savedVisual.civilization),
      orbital: num(savedVisual.orbital),
      instability: num(savedVisual.instability, 1),
      orientation,
    },
    fracturedAt: num(source.fracturedAt, now),
    eventChoices: {},
  }
}

/**
 * Turns arbitrary parsed JSON into a valid GameState, or null if it is not a
 * save at all. Written defensively from day one: save compatibility is the
 * single most expensive thing to retrofit in this genre.
 */
export function migrate(raw: unknown, now = Date.now()): GameState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const source = raw as Record<string, unknown>
  if (!('active' in source) && !('meta' in source)) return null

  const fresh = createGameState(now)
  const active = reviveWorld(source.active, fresh.active.seed, now)

  const savedLegacies = Array.isArray(source.legacies) ? source.legacies : []
  const legacies = savedLegacies
    .map((entry) => reviveLegacy(entry, now))
    .filter((entry): entry is LegacyWorld => entry !== null)

  const savedMeta = (source.meta ?? {}) as Record<string, unknown>
  const highestIndex = legacies.reduce((max, l) => Math.max(max, l.index), active.index)

  return {
    version: SAVE_VERSION,
    createdAt: num(source.createdAt, now),
    lastSeenAt: num(source.lastSeenAt, now),
    active,
    legacies,
    meta: {
      chronon: Math.max(0, num(savedMeta.chronon)),
      lifetimeChronon: Math.max(0, num(savedMeta.lifetimeChronon)),
      fractures: Math.max(legacies.length, Math.floor(num(savedMeta.fractures))),
      nextWorldIndex: Math.max(highestIndex + 1, Math.floor(num(savedMeta.nextWorldIndex, 2))),
      nextSeed: num(savedMeta.nextSeed, nextSeed(active.seed)) || nextSeed(active.seed),
      convergedAt:
        typeof savedMeta.convergedAt === 'number' && Number.isFinite(savedMeta.convergedAt)
          ? savedMeta.convergedAt
          : null,
      endingSeen: savedMeta.endingSeen === true,
    },
  }
}

export function load(now = Date.now()): GameState | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    return migrate(JSON.parse(raw), now)
  } catch {
    return null
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage disabled — nothing to clear */
  }
}

/* ------------------------------------------------------------------ */
/* Export / import                                                     */
/* ------------------------------------------------------------------ */

export function exportSave(state: GameState): string {
  const json = serialize(state)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function importSave(encoded: string, now = Date.now()): GameState | null {
  try {
    const binary = atob(encoded.trim())
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const json = new TextDecoder().decode(bytes)
    return migrate(JSON.parse(json), now)
  } catch {
    return null
  }
}
