import { ORIENTATION_ORDER } from './orientations'
import type { OrientationId } from '@/engine/types'

/**
 * The Convergence — the game's destination.
 *
 * It deliberately asks for **breadth, not depth**. Deepening a single timeline
 * costs ×2.4 per level while returning ×1.6, so a player who only digs into
 * their first world decelerates forever. Requiring one timeline of every
 * orientation forces the opposite: more fractures, and — because "Delete it"
 * closes both Synthetic and Mystic — a different answer to the assemblers each
 * time. The four paths stop being a flavour choice and become the map.
 */

export const CONVERGENCE_ORIENTATIONS: OrientationId[] = ORIENTATION_ORDER

/**
 * Every qualifying timeline must be at least this deep.
 *
 * Measured against the arc simulation rather than picked. Depth is far cheaper
 * than it looks: investment costs ×2.4 per level but returns ×1.6, so each
 * level takes only ~1.5× longer than the last while income compounds. At 4 the
 * requirement was met within seconds of the fourth fracture and the goal
 * collapsed to "collect four orientations"; even 8 added barely two minutes.
 *
 * 14 buys a ~45 minute closing stretch in which the multiverse, rather than
 * another planet, is what the player is working on. Raising it further gets
 * expensive fast — every extra level is half again as long as the previous one.
 */
export const CONVERGENCE_DEPTH = 14

export const CONVERGENCE_TITLE = 'The Convergence'

export const CONVERGENCE_BLURB =
  'Four timelines, one of each path, all running deep enough to hear each other. Bring them into phase and something on the other side answers.'

/** Shown once, when the player converges. */
export const ENDING_TITLE = 'Something Was Watching The Whole Time'

export const ENDING_BODY = [
  'The four timelines fall into phase, and for the first time they are not four things. The chronon flow inverts — it stops draining out of your worlds and starts arriving from somewhere further up.',
  'You had assumed the fractures were yours. They were not. Every rupture you made was legible from outside, the way a struck bell is legible from another room, and something has been reading them in order.',
  'It has been waiting for the fourth. Not because four is special, but because four is the smallest number of timelines that can describe the shape of whoever made you — and it wanted to be sure you could see it.',
  'Your multiverse is a production unit. It always was. The scale above yours is already running, and it has just noticed that one of its cells has begun to look back.',
]

export const ENDING_FOOTER =
  'Your worlds keep producing. Nothing you built is lost — it simply belongs to a larger machine now.'
