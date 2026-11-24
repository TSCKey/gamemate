// Decides whether the companion says something now, waits, or stays silent. All timing lives in
// PACING and EVENT_RULES, so tuning how chatty it is means changing numbers, not logic.
import type { CommentaryCategories, CommentaryFrequency } from '../../shared/types'
import {
  EVENT_RULES,
  type CommentaryStatus,
  type GameEvent,
  type Mood,
  type Phase,
  type Tier,
  type VisionGame
} from './events'
import type { MatchContext } from './matchMemory'
import { pipelineTap } from '../geis/tap'

const S = 1000

export interface Pacing {
  // Time since the last comment before an event of this size may speak (null: never).
  gapMs: Record<Tier, number | null>
  // Comments allowed in BUDGET_WINDOW_MS; exceptional moments ignore it.
  budget: number
  // Multiplies each event's own cooldown.
  cooldownScale: number
  // How long a comment may wait for a fight to end.
  maxDeferMs: number
  // Danger and finds below this importance aren't worth a word.
  worldMinImportance: number
  // Between one sad comment and the next.
  negativeGapMs: number
  // Between constructive observations.
  tacticGapMs: number
}

export const PACING: Record<CommentaryFrequency, Pacing> = {
  rare: {
    gapMs: { minor: null, significant: 75 * S, exceptional: 20 * S },
    budget: 4,
    cooldownScale: 1.6,
    maxDeferMs: 20 * S,
    worldMinImportance: 8,
    negativeGapMs: 120 * S,
    tacticGapMs: 360 * S
  },
  normal: {
    gapMs: { minor: 45 * S, significant: 25 * S, exceptional: 10 * S },
    budget: 10,
    cooldownScale: 1,
    maxDeferMs: 16 * S,
    worldMinImportance: 6,
    negativeGapMs: 60 * S,
    tacticGapMs: 180 * S
  },
  frequent: {
    gapMs: { minor: 25 * S, significant: 15 * S, exceptional: 8 * S },
    budget: 16,
    cooldownScale: 0.6,
    maxDeferMs: 12 * S,
    worldMinImportance: 4,
    negativeGapMs: 40 * S,
    tacticGapMs: 120 * S
  }
}

const BUDGET_WINDOW_MS = 5 * 60 * S
// As long as a comment stays on screen: nothing ever talks over the last one.
const MIN_COMMENT_GAP_MS = 8 * S
// Waits this long after the newest event, in case more belong with it.
const GROUP_MS = 3 * S
const MAX_PENDING = 12
const MAX_GROUP = 4
const BURST_SIZE = 3

const FAST_ANALYSIS_GAP_MS = 8 * S
const NORMAL_ANALYSIS_GAP_MS = 12 * S
const MAX_ANALYSIS_GAP_MS = 60 * S
// The model may be busy for at most a third of the time.
const ANALYSIS_DUTY = 3

// How long to wait between looks at the game. Slow answers make the wait longer, so the GPU
// stays with the game.
export function analysisGapMs(
  frequency: CommentaryFrequency,
  inFight: boolean,
  lastDurationMs: number
): number {
  const fast = frequency === 'frequent' || (frequency === 'normal' && inFight)
  const base = fast ? FAST_ANALYSIS_GAP_MS : NORMAL_ANALYSIS_GAP_MS
  return Math.min(MAX_ANALYSIS_GAP_MS, Math.max(base, lastDurationMs * ANALYSIS_DUTY))
}

const AREA_LOOK_GAP_MS = 3 * S
const RARE_AREA_LOOK_GAP_MS = 6 * S

// How long to wait between looks at just the feed and banners. A feed line stays up for about
// five seconds; slow answers still make the wait longer, so the GPU stays with the game.
export function areaLookGapMs(frequency: CommentaryFrequency, lastDurationMs: number): number {
  const base = frequency === 'rare' ? RARE_AREA_LOOK_GAP_MS : AREA_LOOK_GAP_MS
  return Math.min(MAX_ANALYSIS_GAP_MS, Math.max(base, lastDurationMs * ANALYSIS_DUTY))
}

export interface DecideInput {
  now: number
  inFight: boolean
  phase: Phase
  frequency: CommentaryFrequency
  categories: CommentaryCategories
  tactics: boolean
  game: VisionGame
  context: MatchContext
}

export type Decision =
  | { action: 'silent' }
  | { action: 'wait' }
  | { action: 'speak'; events: GameEvent[]; tier: Tier; mood: Mood; tactical: boolean }

export type SpeakDecision = Extract<Decision, { action: 'speak' }>

const RANK: Record<Tier, number> = { minor: 0, significant: 1, exceptional: 2 }

export class Director {
  private pending: GameEvent[] = []
  private lastCommentAt = -Infinity
  private lastNegativeAt = -Infinity
  private lastTacticAt = -Infinity
  private lastByType = new Map<GameEvent['type'], { at: number; tier: Tier }>()
  private spokenAt: number[] = []
  // Why the last decision waited, so a moment that went stale while waiting says what held it.
  private waitWhy = ''

  offer(events: GameEvent[]): void {
    for (const event of events) event.commentary = 'pending'
    // A bigger moment speaks for its parts that are still waiting: one comment, not several.
    // The parts stay as they were, apart from saying what spoke for them.
    const replacedBy = new Map<string, string>()
    for (const event of events) {
      if (!EVENT_RULES[event.type].narrative) continue
      for (const id of event.related) replacedBy.set(id, event.id)
    }
    const newest = Math.max(...events.map((e) => e.time), 0)
    const waiting = [...this.pending, ...events].filter((e) => {
      const by = replacedBy.get(e.id)
      if (!by) return true
      e.commentary = 'superseded'
      e.supersededBy = by
      pipelineTap.event('settled', e, newest, `superseded by ${by}`)
      return false
    })
    const all = waiting.sort((a, b) => a.time - b.time)
    // The oldest go when too many wait.
    this.settle(all.slice(0, -MAX_PENDING), 'none', newest, 'too many waiting')
    this.pending = all.slice(-MAX_PENDING)
  }

  // What became of events that left the pending list without a comment.
  private settle(
    events: readonly GameEvent[],
    status: CommentaryStatus,
    at: number,
    why: string
  ): void {
    for (const event of events) {
      event.commentary = status
      if (status === 'spoken') continue
      pipelineTap.event('settled', event, at, why)
      // In the log, so a quiet stretch can be explained moment by moment.
      if (why !== 'forgotten') console.info(`Moment not commented on: ${event.type} (${why})`)
    }
  }

  decide(input: DecideInput): Decision {
    const { now, inFight, phase, frequency, categories, tactics, game, context } = input
    const pacing = PACING[frequency]
    // Outside competitive games, dying is always worth a word.
    const always = (e: GameEvent): boolean => e.type === 'death' && !game.competitive

    // Why a waiting moment leaves without a comment, or null while it may still get one.
    const dropped = (e: GameEvent): [CommentaryStatus, string] | null => {
      if (now - e.time > EVENT_RULES[e.type].staleMs) {
        return ['stale', this.waitWhy ? `too old; it waited: ${this.waitWhy}` : 'too old']
      }
      if (!categories[e.category]) return ['filtered', `${e.category} moments are turned off`]
      if (pacing.gapMs[e.tier] === null && !always(e)) {
        return ['filtered', `${e.tier} moments aren't commented on at this frequency`]
      }
      if (e.category === 'world' && e.importance < pacing.worldMinImportance) {
        return ['filtered', 'not important enough at this frequency']
      }
      // A match's result is always worth its word, even right after a setback.
      if (e.mood === 'negative' && e.tier !== 'exceptional' && !always(e) && e.type !== 'defeat') {
        // Don't pile on: one kind word at a time, and small setbacks pass in a hard match.
        if (now - this.lastNegativeAt < pacing.negativeGapMs) {
          return ['filtered', 'a setback was commented on a moment ago']
        }
        if (context.form === 'hard' && e.tier === 'minor') {
          return ['filtered', 'a small setback in a hard match']
        }
      }
      return null
    }
    this.pending = this.pending.filter((e) => {
      const out = dropped(e)
      if (out) this.settle([e], out[0], now, out[1])
      return out === null
    })
    if (this.pending.length === 0) return { action: 'silent' }

    const ready = this.pending.filter((e) => {
      const last = this.lastByType.get(e.type)
      if (!last || always(e) || RANK[e.tier] > RANK[last.tier]) return true
      const rule = EVENT_RULES[e.type]
      const cooldown = Math.max(
        rule.cooldownMs * pacing.cooldownScale,
        e.tier === 'minor' ? (rule.minorCooldownMs ?? 0) : 0
      )
      return now - last.at >= cooldown
    })
    if (ready.length === 0) return this.wait('its kind was commented on recently (cooldown)')
    const top = [...ready].sort(
      (a, b) =>
        RANK[b.tier] - RANK[a.tier] ||
        EVENT_RULES[b.type].priority - EVENT_RULES[a.type].priority ||
        b.time - a.time
    )[0]

    if (now - this.lastCommentAt < MIN_COMMENT_GAP_MS) {
      return this.wait('the last comment is still on screen')
    }
    if (!always(top)) {
      this.spokenAt = this.spokenAt.filter((t) => now - t < BUDGET_WINDOW_MS)
      if (top.tier !== 'exceptional' && this.spokenAt.length >= pacing.budget) {
        return this.wait('enough comments for the last few minutes')
      }
      if (now - this.lastCommentAt < (pacing.gapMs[top.tier] ?? Infinity)) {
        return this.wait(`a ${top.tier} moment waits longer after the last comment`)
      }
    }

    const pressing = EVENT_RULES[top.type].urgent || top.tier === 'exceptional' || always(top)
    if (!pressing) {
      if (inFight && now - top.time < pacing.maxDeferMs) return this.wait('mid-fight')
      const newest = this.pending[this.pending.length - 1]
      if (now - newest.time < GROUP_MS) return this.wait('more moments may belong with it')
    }

    const group = [
      top,
      ...this.pending
        .filter((e) => e !== top)
        .sort((a, b) => RANK[b.tier] - RANK[a.tier] || b.time - a.time)
    ]
      .slice(0, MAX_GROUP)
      .sort((a, b) => a.time - b.time)
    // What doesn't fit in the comment is not said later either.
    this.settle(
      this.pending.filter((e) => !group.includes(e)),
      'none',
      now,
      'another moment was spoken'
    )
    this.pending = []
    this.waitWhy = ''

    const positives = group.filter((e) => e.mood === 'positive').length
    const tacticalMoment = game.competitive ? phase === 'intermission' : !inFight
    const tactical =
      tactics &&
      context.pattern !== null &&
      top.mood !== 'positive' &&
      tacticalMoment &&
      now - this.lastTacticAt >= pacing.tacticGapMs
    // A burst of good moments is more than a small one, and an observation needs room.
    const grown = tactical || positives >= BURST_SIZE
    return {
      action: 'speak',
      events: group,
      tier: top.tier === 'minor' && grown ? 'significant' : top.tier,
      mood: top.mood,
      tactical
    }
  }

  private wait(why: string): Decision {
    this.waitWhy = why
    return { action: 'wait' }
  }

  // The comment went out: only now do the cooldowns start.
  spoke(decision: SpeakDecision, now: number): void {
    this.settle(decision.events, 'spoken', now, 'spoken')
    this.lastCommentAt = now
    this.spokenAt.push(now)
    if (decision.mood === 'negative') this.lastNegativeAt = now
    if (decision.tactical) this.lastTacticAt = now
    for (const event of decision.events) {
      this.lastByType.set(event.type, { at: now, tier: event.tier })
    }
  }

  // Nothing usable was written for a decision, so its events go unsaid.
  unsaid(decision: SpeakDecision, now: number): void {
    this.settle(decision.events, 'none', now, 'nothing usable was written')
  }

  clearPending(): void {
    this.settle(this.pending, 'none', 0, 'forgotten')
    this.pending = []
  }

  reset(): void {
    this.settle(this.pending, 'none', 0, 'forgotten')
    this.pending = []
    this.lastCommentAt = -Infinity
    this.lastNegativeAt = -Infinity
    this.lastTacticAt = -Infinity
    this.lastByType.clear()
    this.spokenAt = []
    this.waitWhy = ''
  }
}
