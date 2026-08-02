/**
 * Core data shapes for AfterWorld.
 *
 * The engine is plain TypeScript and knows nothing about React. State is a
 * mutable plain object; the UI subscribes to a version counter rather than
 * receiving new immutable snapshots every tick.
 */

export type ResourceId = 'energy' | 'matter' | 'alloy' | 'chronon'

export type EraId = 'dead-core' | 'first-matter' | 'machines'

export type OrientationId = 'industrial' | 'organic' | 'synthetic' | 'mystic'

export type BuildingId =
  | 'core-tap'
  | 'thermal-vent'
  | 'generator'
  | 'condenser'
  | 'drill'
  | 'smelter'
  | 'assembler'
  | 'foundry'
  | 'orbital-collector'

export type UpgradeId = string

/* ------------------------------------------------------------------ */
/* Unlock conditions                                                    */
/* ------------------------------------------------------------------ */

export type Unlock =
  | { kind: 'always' }
  | { kind: 'era'; era: EraId }
  | { kind: 'lifetime'; resource: ResourceId; amount: number }
  | { kind: 'buildingCount'; building: BuildingId; count: number }
  | { kind: 'upgrade'; upgrade: UpgradeId }
  | { kind: 'all'; of: Unlock[] }

/* ------------------------------------------------------------------ */
/* Content definitions (static, live in src/content)                    */
/* ------------------------------------------------------------------ */

export interface ResourceDef {
  id: ResourceId
  name: string
  /** CSS custom property name carrying this resource's hue. */
  colorVar: string
  blurb: string
}

/**
 * A building tier is a visible promotion: same slot, same owned count, new
 * identity and output. This is the "Generator -> Reactor -> Artificial Sun"
 * progression that makes growth legible rather than purely numeric.
 */
export interface BuildingTier {
  name: string
  flavor: string
  /** Owned count at which this tier takes over. Tier 0 must use 0. */
  at: number
  /** Output multiplier relative to the building's base rate. */
  mult: number
}

export interface BuildingDef {
  id: BuildingId
  era: EraId
  produces: ResourceId
  /** Output per second, per building owned, before any multiplier. */
  base: number
  /** Input consumed per second, per building owned, at full efficiency. */
  consumes?: Partial<Record<ResourceId, number>>
  cost: { resource: ResourceId; base: number; growth: number }
  /** Ordered by `at`, ascending. Index 0 is the starting identity. */
  tiers: BuildingTier[]
  unlock: Unlock
}

export type UpgradeEffect =
  | { kind: 'buildingMult'; building: BuildingId; mult: number }
  | { kind: 'resourceMult'; resource: ResourceId; mult: number }
  | { kind: 'globalMult'; mult: number }
  | { kind: 'costReduction'; building: BuildingId; factor: number }

export interface UpgradeDef {
  id: UpgradeId
  name: string
  blurb: string
  era: EraId
  cost: Partial<Record<ResourceId, number>>
  effects: UpgradeEffect[]
  unlock: Unlock
}

export interface EraDef {
  id: EraId
  index: number
  name: string
  blurb: string
  /** Reaching this lifetime total advances the world into this era. */
  entry: { resource: ResourceId; amount: number } | null
}

/**
 * What a legacy world grants the rest of the multiverse, forever. This is the
 * payload of the fracture decision — the orientation is permanent.
 */
export type Boon =
  | { kind: 'resourceMult'; resource: ResourceId; perLevel: number }
  | { kind: 'globalMult'; perLevel: number }
  | { kind: 'costReduction'; perLevel: number }
  | { kind: 'chrononMult'; perLevel: number }

export interface OrientationDef {
  id: OrientationId
  name: string
  blurb: string
  /** Long-form text shown on the fracture screen. */
  consequence: string
  colorVar: string
  /** Multiplier on this world's own chronon output. */
  chrononMult: number
  boon: Boon
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type EventEffect =
  | { kind: 'grantResource'; resource: ResourceId; amount: number }
  | { kind: 'globalMult'; mult: number }
  | { kind: 'resourceMult'; resource: ResourceId; mult: number }
  | { kind: 'profileMult'; mult: number }
  | { kind: 'unlockOrientation'; orientation: OrientationId }
  | { kind: 'lockOrientation'; orientation: OrientationId }

export interface EventChoiceDef {
  id: string
  label: string
  /** Plain description of the trade — no hidden costs. */
  outcome: string
  effects: EventEffect[]
}

export interface EventDef {
  id: string
  title: string
  body: string
  unlock: Unlock
  choices: EventChoiceDef[]
}

/* ------------------------------------------------------------------ */
/* Runtime state                                                       */
/* ------------------------------------------------------------------ */

export interface BuildingState {
  count: number
  /** 0..1 — how much of its input demand was met last tick. UI only. */
  efficiency: number
}

export interface WorldStats {
  lifetime: Record<ResourceId, number>
  startedAt: number
  /** Accumulated play time in seconds, including offline catch-up. */
  elapsed: number
}

export interface World {
  id: string
  /** Drives every procedural visual. Never changes once assigned. */
  seed: number
  index: number
  era: EraId
  resources: Record<ResourceId, number>
  buildings: Record<BuildingId, BuildingState>
  upgrades: UpgradeId[]
  stats: WorldStats
  /** Choices already made this timeline: eventId -> choiceId. */
  eventChoices: Record<string, string>
  /** Event waiting for the player. Blocks nothing, but nags. */
  pendingEvent: string | null
  /** Multipliers granted by resolved events this timeline. */
  eventMods: {
    global: number
    perResource: Partial<Record<ResourceId, number>>
    profile: number
  }
  /** Orientations this timeline's choices made available or forbidden. */
  orientationsUnlocked: OrientationId[]
  orientationsLocked: OrientationId[]
}

/**
 * A fractured timeline. Never re-simulated: its final production is frozen
 * into `profile`, so ticking it costs one multiply per resource.
 */
export interface LegacyWorld {
  id: string
  seed: number
  index: number
  name: string
  orientation: OrientationId
  era: EraId
  /** Per-second output at the moment of fracture, before invest scaling. */
  profile: Partial<Record<ResourceId, number>>
  /** Chronons per second at investLevel 0, before multiverse multipliers. */
  chrononBase: number
  investLevel: number
  /** Frozen so the thumbnail is identical forever. */
  visual: PlanetVisualState
  fracturedAt: number
  eventChoices: Record<string, string>
}

export interface PlanetVisualState {
  seed: number
  era: EraId
  /** 0..1 how reworked the crust is — drives terrain relief. */
  terraform: number
  /** 0..1 ocean coverage. */
  ocean: number
  /** 0..1 vegetation density. */
  biomass: number
  /** 0..1 city light density. */
  civilization: number
  /** 0..1 orbital machinery presence. */
  orbital: number
  /** 0..1 temporal instability — rift shimmer. */
  instability: number
  orientation: OrientationId | null
}

export interface OfflineReport {
  seconds: number
  gains: Partial<Record<ResourceId, number>>
  chronon: number
  capped: boolean
}

export interface MetaState {
  chronon: number
  lifetimeChronon: number
  fractures: number
  nextWorldIndex: number
  nextSeed: number
  /** When the multiverse converged, or null while the arc is unfinished. */
  convergedAt: number | null
  /** Whether the reveal has been read, so it is shown exactly once. */
  endingSeen: boolean
}

export interface GameState {
  version: number
  createdAt: number
  lastSeenAt: number
  active: World
  legacies: LegacyWorld[]
  meta: MetaState
}
