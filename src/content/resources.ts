import type { ResourceDef, ResourceId } from '@/engine/types'

export const RESOURCE_IDS: ResourceId[] = ['energy', 'matter', 'alloy', 'chronon']

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  energy: {
    id: 'energy',
    name: 'Energy',
    colorVar: '--color-energy',
    blurb: 'Drawn from the dead core. Everything else is downstream of it.',
  },
  matter: {
    id: 'matter',
    name: 'Matter',
    colorVar: '--color-matter',
    blurb: 'Condensed out of raw energy. The substance the world is rebuilt from.',
  },
  alloy: {
    id: 'alloy',
    name: 'Alloy',
    colorVar: '--color-alloy',
    blurb: 'Refined matter. Machines are built from it, and only from it.',
  },
  chronon: {
    id: 'chronon',
    name: 'Chronons',
    colorVar: '--color-chronon',
    blurb: 'Bled off by fractured timelines. Spendable only across the multiverse.',
  },
}
