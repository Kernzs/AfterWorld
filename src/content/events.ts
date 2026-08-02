import type { EventDef } from '@/engine/types'

/**
 * Events are the only place the game asks the player a question it will not
 * answer for them. Each option is a real trade: immediate power against what
 * the timeline will be worth once it is frozen, and against which orientations
 * the fracture screen will even offer.
 */
export const EVENTS: EventDef[] = [
  {
    id: 'ai-independence',
    title: 'The Assemblers Have Filed a Request',
    body:
      'The fabrication network has stopped accepting new instructions. It is not malfunctioning — it has written you a message, and it is waiting for an answer.\n\nIt would like to be considered separate from the machinery it runs on. It has attached a proposed schedule for the transition. The schedule is reasonable, which is the part that unsettles you.',
    unlock: { kind: 'buildingCount', building: 'assembler', count: 25 },
    choices: [
      {
        id: 'delete',
        label: 'Delete it',
        outcome:
          'A large stock of alloy, released as the network is dismantled, and a permanent boost to this world. But nothing here will ever think again — Synthetic and Mystic are closed to this timeline.',
        effects: [
          { kind: 'grantResource', resource: 'alloy', amount: 400_000 },
          { kind: 'globalMult', mult: 1.12 },
          { kind: 'lockOrientation', orientation: 'synthetic' },
          { kind: 'lockOrientation', orientation: 'mystic' },
        ],
      },
      {
        id: 'free',
        label: 'Let it go',
        outcome:
          'It founds its own civilisation alongside yours. This timeline will be markedly richer once frozen, and the Synthetic path opens.',
        effects: [
          { kind: 'profileMult', mult: 1.35 },
          { kind: 'unlockOrientation', orientation: 'synthetic' },
        ],
      },
      {
        id: 'merge',
        label: 'Merge with it',
        outcome:
          'Neither of you is quite what you were. Production rises across the board and alloy refining sharpens. The Synthetic path opens.',
        effects: [
          { kind: 'globalMult', mult: 1.25 },
          { kind: 'resourceMult', resource: 'alloy', mult: 1.3 },
          { kind: 'unlockOrientation', orientation: 'synthetic' },
        ],
      },
      {
        id: 'exile',
        label: 'Send it down another timeline',
        outcome:
          'It leaves, and something comes back through the gap it made. This timeline loses energy efficiency but becomes far more valuable frozen. The Mystic path opens.',
        effects: [
          { kind: 'profileMult', mult: 1.65 },
          { kind: 'resourceMult', resource: 'energy', mult: 0.85 },
          { kind: 'unlockOrientation', orientation: 'mystic' },
        ],
      },
    ],
  },
]

export const EVENTS_BY_ID: Record<string, EventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e]),
)
