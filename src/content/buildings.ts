import type { BuildingDef, BuildingId } from '@/engine/types'

/** Display order — grouped by era, which is how the player thinks about them. */
export const BUILDING_ORDER: BuildingId[] = [
  'core-tap',
  'thermal-vent',
  'generator',
  'condenser',
  'drill',
  'smelter',
  'assembler',
  'foundry',
  'orbital-collector',
]

/**
 * Simulation order, deliberately different from display order: every producer
 * of a resource runs before anything that consumes it, so a production chain
 * settles inside one tick. Ordering them by era instead would make each link
 * of the chain lag one tick behind the previous, which shows up as visible
 * oscillation in efficiency once the numbers get large.
 */
export const BUILDING_TICK_ORDER: BuildingId[] = [
  // Energy producers
  'core-tap',
  'thermal-vent',
  'generator',
  'orbital-collector',
  // Matter producers (consume energy)
  'condenser',
  'drill',
  'foundry',
  // Alloy producers (consume matter)
  'smelter',
  'assembler',
]

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  /* ---------------- Era 1 — Dead Core ---------------- */

  'core-tap': {
    id: 'core-tap',
    era: 'dead-core',
    produces: 'energy',
    base: 0.2,
    cost: { resource: 'energy', base: 10, growth: 1.14 },
    unlock: { kind: 'always' },
    tiers: [
      { at: 0, mult: 1, name: 'Core Tap', flavor: 'A needle in the mantle. It barely registers.' },
      { at: 25, mult: 3, name: 'Mantle Siphon', flavor: 'The taps have merged into one wound that will not close.' },
      { at: 60, mult: 9, name: 'Geothermal Lattice', flavor: 'A web of heat under the crust, drawn tight.' },
      { at: 120, mult: 28, name: 'Core Bloom', flavor: 'The core is no longer contained. It is cultivated.' },
    ],
  },

  'thermal-vent': {
    id: 'thermal-vent',
    era: 'dead-core',
    produces: 'energy',
    base: 2.2,
    cost: { resource: 'energy', base: 120, growth: 1.15 },
    unlock: { kind: 'lifetime', resource: 'energy', amount: 60 },
    tiers: [
      { at: 0, mult: 1, name: 'Thermal Vent', flavor: 'Pressure finds the surface and screams.' },
      { at: 30, mult: 3.5, name: 'Pressure Column', flavor: 'The scream is now load-bearing.' },
      { at: 70, mult: 11, name: 'Magma Turbine', flavor: 'Rock flows through blades and comes out as current.' },
      { at: 130, mult: 34, name: 'Mantle Engine', flavor: 'The planet turns because you asked it to.' },
    ],
  },

  generator: {
    id: 'generator',
    era: 'dead-core',
    produces: 'energy',
    base: 26,
    cost: { resource: 'energy', base: 2_000, growth: 1.16 },
    unlock: { kind: 'lifetime', resource: 'energy', amount: 1_200 },
    tiers: [
      { at: 0, mult: 1, name: 'Generator', flavor: 'The first machine that pays for itself.' },
      { at: 25, mult: 4, name: 'Fusion Reactor', flavor: 'Small stars, held still, made to work shifts.' },
      { at: 60, mult: 13, name: 'Artificial Sun', flavor: 'It hangs above the crust and refuses to set.' },
      { at: 120, mult: 42, name: 'Stellar Forge', flavor: 'Suns are now an intermediate product.' },
    ],
  },

  /* ---------------- Era 2 — First Matter ---------------- */

  condenser: {
    id: 'condenser',
    era: 'first-matter',
    produces: 'matter',
    base: 0.5,
    consumes: { energy: 4 },
    cost: { resource: 'energy', base: 4_000, growth: 1.13 },
    unlock: { kind: 'era', era: 'first-matter' },
    tiers: [
      { at: 0, mult: 1, name: 'Condenser', flavor: 'Energy cools, hesitates, and becomes a thing.' },
      { at: 25, mult: 3, name: 'Matter Loom', flavor: 'Substance woven a thread at a time.' },
      { at: 60, mult: 9.5, name: 'Quantum Weaver', flavor: 'It makes matter out of the possibility of matter.' },
      { at: 120, mult: 30, name: 'Genesis Chamber', flavor: 'Nothing goes in. Continents come out.' },
    ],
  },

  drill: {
    id: 'drill',
    era: 'first-matter',
    produces: 'matter',
    base: 6,
    consumes: { energy: 34 },
    cost: { resource: 'matter', base: 400, growth: 1.14 },
    unlock: { kind: 'buildingCount', building: 'condenser', count: 8 },
    tiers: [
      { at: 0, mult: 1, name: 'Crust Drill', flavor: 'Taking back what the crust was only holding.' },
      { at: 25, mult: 3.5, name: 'Deep Bore', flavor: 'Past the crust now, into the parts with opinions.' },
      { at: 60, mult: 11, name: 'Tectonic Harvester', flavor: 'Plates are fed in whole.' },
      { at: 120, mult: 35, name: 'World Splitter', flavor: 'The planet is a supply of planet.' },
    ],
  },

  smelter: {
    id: 'smelter',
    era: 'first-matter',
    produces: 'alloy',
    base: 0.35,
    consumes: { matter: 2.2, energy: 22 },
    cost: { resource: 'matter', base: 3_000, growth: 1.15 },
    unlock: { kind: 'buildingCount', building: 'drill', count: 10 },
    tiers: [
      { at: 0, mult: 1, name: 'Smelter', flavor: 'Matter, persuaded into keeping a shape.' },
      { at: 20, mult: 4, name: 'Arc Furnace', flavor: 'Lightning used as a hand tool.' },
      { at: 50, mult: 12, name: 'Plasma Crucible', flavor: 'Nothing survives it except what you wanted.' },
      { at: 100, mult: 38, name: 'Star Forge', flavor: 'Alloy poured by the light of a captive star.' },
    ],
  },

  /* ---------------- Era 3 — Machines ---------------- */

  assembler: {
    id: 'assembler',
    era: 'machines',
    produces: 'alloy',
    base: 4,
    consumes: { matter: 45 },
    cost: { resource: 'alloy', base: 300, growth: 1.15 },
    unlock: { kind: 'era', era: 'machines' },
    tiers: [
      { at: 0, mult: 1, name: 'Assembler', flavor: 'It builds. You stopped specifying what, some time ago.' },
      { at: 25, mult: 3.5, name: 'Fabrication Swarm', flavor: 'Thousands of small decisions, none of them yours.' },
      { at: 60, mult: 12, name: 'Self-Replicating Array', flavor: 'The count goes up whether you buy or not.' },
      { at: 120, mult: 38, name: 'Machine Choir', flavor: 'They have started to agree with each other.' },
    ],
  },

  foundry: {
    id: 'foundry',
    era: 'machines',
    produces: 'matter',
    base: 620,
    consumes: { energy: 2_400 },
    cost: { resource: 'alloy', base: 6_000, growth: 1.16 },
    unlock: { kind: 'buildingCount', building: 'assembler', count: 12 },
    tiers: [
      { at: 0, mult: 1, name: 'Foundry', flavor: 'Industry at the scale of weather.' },
      { at: 20, mult: 4, name: 'Continental Foundry', flavor: 'Visible from orbit. Audible from further.' },
      { at: 50, mult: 13, name: 'Planetary Forge', flavor: 'The planet is the machine now.' },
      { at: 100, mult: 44, name: 'Ringworld Mill', flavor: 'Output measured against the mass of the world itself.' },
    ],
  },

  'orbital-collector': {
    id: 'orbital-collector',
    era: 'machines',
    produces: 'energy',
    base: 6_500,
    cost: { resource: 'alloy', base: 20_000, growth: 1.16 },
    unlock: { kind: 'buildingCount', building: 'assembler', count: 20 },
    tiers: [
      { at: 0, mult: 1, name: 'Orbital Collector', flavor: 'The first thing you built that left the ground.' },
      { at: 20, mult: 4.5, name: 'Dyson Ring', flavor: 'A band of mirrors, closing.' },
      { at: 50, mult: 14, name: 'Solar Shroud', flavor: 'The sky is now a component.' },
      { at: 100, mult: 48, name: 'Starlight Siphon', flavor: 'Other stars have begun to dim. That is expected.' },
    ],
  },
}
