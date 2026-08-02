import { EVENTS, EVENTS_BY_ID } from '@/content/events'
import { isUnlocked } from './formulas'
import type { EventChoiceDef, EventDef, ResourceId, World } from './types'

/** Raises the first unmet, unlocked event. At most one waits at a time. */
export function checkEvents(world: World): boolean {
  if (world.pendingEvent) return false
  for (const def of EVENTS) {
    if (world.eventChoices[def.id]) continue
    if (isUnlocked(def.unlock, world)) {
      world.pendingEvent = def.id
      return true
    }
  }
  return false
}

export function pendingEvent(world: World): EventDef | null {
  return world.pendingEvent ? (EVENTS_BY_ID[world.pendingEvent] ?? null) : null
}

/**
 * Applies a choice. Effects land in `world.eventMods` rather than on the
 * resources directly, so they survive into the mods recomputation and can be
 * shown to the player as an ongoing consequence rather than a one-off.
 */
export function resolveEvent(world: World, eventId: string, choiceId: string): boolean {
  const def = EVENTS_BY_ID[eventId]
  if (!def) return false
  if (world.eventChoices[eventId]) return false

  const choice: EventChoiceDef | undefined = def.choices.find((c) => c.id === choiceId)
  if (!choice) return false

  for (const fx of choice.effects) {
    switch (fx.kind) {
      case 'grantResource':
        world.resources[fx.resource] += fx.amount
        world.stats.lifetime[fx.resource] += fx.amount
        break
      case 'globalMult':
        world.eventMods.global *= fx.mult
        break
      case 'resourceMult': {
        const key = fx.resource as ResourceId
        world.eventMods.perResource[key] = (world.eventMods.perResource[key] ?? 1) * fx.mult
        break
      }
      case 'profileMult':
        world.eventMods.profile *= fx.mult
        break
      case 'unlockOrientation':
        if (!world.orientationsUnlocked.includes(fx.orientation)) {
          world.orientationsUnlocked.push(fx.orientation)
        }
        break
      case 'lockOrientation':
        if (!world.orientationsLocked.includes(fx.orientation)) {
          world.orientationsLocked.push(fx.orientation)
        }
        break
    }
  }

  world.eventChoices[eventId] = choiceId
  world.pendingEvent = null
  return true
}
