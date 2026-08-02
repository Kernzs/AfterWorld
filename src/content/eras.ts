import type { EraDef, EraId } from '@/engine/types'

/** Ordered. A world advances when its lifetime total crosses the next entry. */
export const ERA_ORDER: EraId[] = ['dead-core', 'first-matter', 'machines']

export const ERAS: Record<EraId, EraDef> = {
  'dead-core': {
    id: 'dead-core',
    index: 0,
    name: 'Dead Core',
    blurb: 'A cold husk with a heartbeat. Nothing here but pressure and heat.',
    entry: null,
  },
  'first-matter': {
    id: 'first-matter',
    index: 1,
    name: 'First Matter',
    blurb: 'Energy thickens into substance. The crust begins to mean something.',
    entry: { resource: 'energy', amount: 5_000 },
  },
  machines: {
    id: 'machines',
    index: 2,
    name: 'Machines',
    blurb: 'The world starts building itself. You are no longer strictly necessary.',
    entry: { resource: 'matter', amount: 100_000 },
  },
}

/** Fracturing becomes possible once the machines have run long enough. */
export const FRACTURE_REQUIREMENT = { resource: 'alloy' as const, amount: 4_000_000 }
