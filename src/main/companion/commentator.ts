// The commentary pipeline after the screen has been read: remove repeats, remember, size each
// event, decide, write the reaction with the AI, hand it over. Free of Electron, so it can be
// tested with a fake clock and a fake AI.
import type { LanguageCode } from '../../shared/languages'
import type {
  CommentaryCategories,
  CommentaryFrequency,
  CommentaryHumor,
  ReactionIntensity
} from '../../shared/types'
import { Director, type SpeakDecision } from './director'
import {
  EVENT_RULES,
  type FrameReport,
  type GameEvent,
  type GameEventType,
  type Phase,
  type Tier,
  type VisionGame
} from './events'
import { MatchMemory, type MatchContext } from './matchMemory'
import {
  claimsTooMuch,
  cleanReaction,
  isRepeat,
  reactionPrompt,
  type ReactionRequest
} from './reaction'

export interface CommentaryOptions {
  frequency: CommentaryFrequency
  intensity: ReactionIntensity
  humor: CommentaryHumor
  categories: CommentaryCategories
  tactics: boolean
  language: LanguageCode
  game: VisionGame
}

export interface CommentatorDeps {
  generate: (prompt: string) => Promise<string>
  deliver: (text: string, events: GameEvent[]) => void
  // Whether a comment may go out right now.
  canSpeak?: () => boolean
  now?: () => number
}

const SEEN_MEMORY_MS = 3 * 60_000
// A screen that stays up can go unread this long (the scene doesn't change) and still be the same.
const STICKY_MAX_GAP_MS = 120_000
const STREAK_EXCEPTIONAL = 5
const MULTIKILL_EXCEPTIONAL = 4
const WORLD_SIGNIFICANT = 8
const SAY_IT_DIFFERENTLY =
  '\nThat last attempt was too close to something you already said: word it differently.'

function eventKey(event: GameEvent): string {
  const counted = event.type === 'multikill' || event.type === 'kill_streak'
  return `${event.type}:${event.opponent.toLowerCase()}${counted ? `:${event.count}` : ''}`
}

// How big a moment this is, given the match so far.
function sizeOf(event: GameEvent, context: MatchContext, game: VisionGame): Tier {
  switch (event.type) {
    case 'kill':
      return event.count >= 2 || context.killStreak >= 2 ? 'significant' : 'minor'
    case 'multikill':
      return event.count >= MULTIKILL_EXCEPTIONAL ? 'exceptional' : 'significant'
    case 'kill_streak':
      return event.count >= STREAK_EXCEPTIONAL ? 'exceptional' : 'significant'
    case 'death': {
      if (!game.competitive) return 'significant'
      const sameOpponent =
        event.opponent !== '' &&
        context.nemesis?.name.toLowerCase() === event.opponent.toLowerCase()
      return sameOpponent || context.pattern ? 'significant' : 'minor'
    }
    default:
      if (event.category === 'world' && event.importance >= WORLD_SIGNIFICANT) return 'significant'
      return event.tier
  }
}

export class Commentator {
  private memory = new MatchMemory()
  private director = new Director()
  private seen = new Map<string, number>()
  private lastFrameKeys = new Set<string>()
  private newestFrame = -Infinity
  private gameId: string | null = null
  private inFight = false
  private phase: Phase = 'playing'
  private writing = false
  // Goes up on every reset, so a comment still being written can tell it is out of date.
  private run = 0
  private readonly now: () => number
  private readonly canSpeak: () => boolean

  constructor(private readonly deps: CommentatorDeps) {
    this.now = deps.now ?? ((): number => Date.now())
    this.canSpeak = deps.canSpeak ?? ((): boolean => true)
  }

  // Takes in one look at the game and returns the new events it brought.
  observe(report: FrameReport, game: VisionGame): GameEvent[] {
    if (this.gameId !== game.id) {
      if (this.gameId !== null) this.startOver()
      this.gameId = game.id
    }
    const { fresh, held } = this.removeRepeats(report)
    const derived = this.memory.absorb({ ...report, events: fresh }, held)
    for (const event of derived) this.seen.set(eventKey(event), event.time)

    const events = [...fresh, ...derived]
    const context = this.memory.context(this.now())
    for (const event of events) event.tier = sizeOf(event, context, game)
    this.director.offer(events)

    if (report.time >= this.newestFrame) {
      this.newestFrame = report.time
      this.inFight = report.inFight
      this.phase = report.phase
    }
    return events
  }

  private removeRepeats(report: FrameReport): {
    fresh: GameEvent[]
    held: Set<GameEventType>
  } {
    for (const [key, time] of this.seen) {
      if (Math.abs(report.time - time) > SEEN_MEMORY_MS) this.seen.delete(key)
    }
    const fresh: GameEvent[] = []
    const held = new Set<GameEventType>()
    const keys = new Set<string>()
    for (const event of report.events) {
      const rule = EVENT_RULES[event.type]
      const key = eventKey(event)
      keys.add(key)
      const lastSeen = this.seen.get(key)
      const closeEnough = lastSeen !== undefined && Math.abs(report.time - lastSeen) < rule.dedupeMs
      const stillUp =
        rule.sticky === true &&
        this.lastFrameKeys.has(key) &&
        lastSeen !== undefined &&
        Math.abs(report.time - lastSeen) < STICKY_MAX_GAP_MS
      const nameless = rule.namedDedupe === true && event.opponent === ''
      if (!nameless && (closeEnough || stillUp)) {
        if (rule.sticky) {
          held.add(event.type)
          this.seen.set(key, report.time)
        }
        continue
      }
      this.seen.set(key, event.time)
      fresh.push(event)
    }
    if (report.time >= this.newestFrame) this.lastFrameKeys = keys
    return { fresh, held }
  }

  // Makes at most one comment. Never runs twice at once; anything that happens meanwhile waits
  // for the next call.
  async speakIfDue(options: CommentaryOptions): Promise<string | null> {
    if (this.writing || !this.canSpeak()) return null
    const now = this.now()
    const context = this.memory.context(now)
    const decision = this.director.decide({
      now,
      inFight: this.inFight,
      phase: this.phase,
      frequency: options.frequency,
      categories: options.categories,
      tactics: options.tactics,
      game: options.game,
      context
    })
    if (decision.action !== 'speak') return null

    this.writing = true
    const run = this.run
    try {
      const text = await this.write(decision, context, options)
      if (!text || run !== this.run || !this.canSpeak()) return null
      this.deps.deliver(text, decision.events)
      this.memory.rememberComment(text)
      this.director.spoke(decision, this.now())
      return text
    } catch (error) {
      console.error('Could not write a comment', error)
      return null
    } finally {
      this.writing = false
    }
  }

  private async write(
    decision: SpeakDecision,
    context: MatchContext,
    options: CommentaryOptions
  ): Promise<string> {
    const recent = this.memory.recentComments()
    const request: ReactionRequest = {
      game: options.game,
      language: options.language,
      tier: decision.tier,
      mood: decision.mood,
      events: decision.events,
      context,
      recent,
      intensity: options.intensity,
      humor: options.humor,
      tactical: decision.tactical
    }
    const prompt = reactionPrompt(request)
    const usable = (text: string): boolean =>
      !isRepeat(text, recent) && !claimsTooMuch(text, decision.events)
    const first = cleanReaction(await this.deps.generate(prompt), decision.tier)
    if (!first || usable(first)) return first
    // Small moments don't deserve a second AI call: silence is fine.
    if (decision.tier === 'minor') return ''
    const second = cleanReaction(
      await this.deps.generate(prompt + SAY_IT_DIFFERENTLY),
      decision.tier
    )
    return usable(second) ? second : ''
  }

  context(): MatchContext {
    return this.memory.context(this.now())
  }

  // How the last look at the game went, for deciding when to look again.
  isInFight(): boolean {
    return this.inFight
  }

  private startOver(): void {
    this.memory.startNewMatch()
    this.director.clearPending()
    this.seen.clear()
    this.lastFrameKeys = new Set()
    this.newestFrame = -Infinity
    this.inFight = false
    this.phase = 'playing'
  }

  // Forgets everything, including a comment still being written.
  reset(): void {
    this.run++
    this.startOver()
    this.memory.reset()
    this.director.reset()
    this.gameId = null
  }
}
