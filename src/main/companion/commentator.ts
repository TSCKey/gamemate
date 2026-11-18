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
import { EventEngine } from '../geis/engine'
import { CorrelationEngine } from '../geis/correlation'
import { RULES } from '../geis/rules'
import { MatchMemory, type MatchContext } from './matchMemory'
import { SessionMemory } from './sessionMemory'
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
// From this many tries at a boss, beating it or losing to it is a story.
const HARD_BOSS_ATTEMPTS = 3
const SAY_IT_DIFFERENTLY =
  '\nThat last attempt was too close to something you already said: word it differently.'

function eventKey(event: GameEvent): string {
  const counted = event.type === 'multikill' || event.type === 'kill_streak'
  // An area is told apart by its name (it is in `place`, with no opponent), so two different
  // areas close together are two events.
  const named =
    event.type === 'area_entered' ? event.place.toLowerCase() : event.opponent.toLowerCase()
  return `${event.type}:${named}${counted ? `:${event.count}` : ''}`
}

// How big a moment this is, given the match so far.
function sizeOf(event: GameEvent, context: MatchContext, game: VisionGame): Tier {
  switch (event.type) {
    case 'boss_encounter':
      return 'significant'
    case 'fight_won':
      // Memory put the number of attempts in `count`.
      return event.source === 'screen' && event.count >= HARD_BOSS_ATTEMPTS
        ? 'exceptional'
        : event.tier
    case 'kill':
      return event.count >= 2 || context.killStreak >= 2 ? 'significant' : 'minor'
    case 'multikill':
      return event.count >= MULTIKILL_EXCEPTIONAL ? 'exceptional' : 'significant'
    case 'kill_streak':
      return event.count >= STREAK_EXCEPTIONAL ? 'exceptional' : 'significant'
    case 'death': {
      if (event.source === 'screen') {
        // Memory put the attempt number at the boss it died to in `count` (1 for no boss).
        return event.opponent !== '' && event.count >= HARD_BOSS_ATTEMPTS ? 'significant' : 'minor'
      }
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
  // Used instead of match memory for games read off the screen (single-player).
  private session = new SessionMemory()
  private lastSource: FrameReport['source'] = 'vision'
  private director = new Director()
  private engine: EventEngine
  private rules: CorrelationEngine
  private competitive = false
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
    this.engine = new EventEngine(this.now)
    this.rules = new CorrelationEngine(RULES, () =>
      this.competitive ? 'competitive' : 'single-player'
    )
  }

  // Takes in one look at the game and returns the new events it brought. `checks` are the types
  // the reporting adapter verifies itself (see EventEngine.accept).
  observe(report: FrameReport, game: VisionGame, checks?: ReadonlySet<GameEventType>): GameEvent[] {
    if (this.gameId !== game.id) {
      if (this.gameId !== null) this.startOver()
      this.gameId = game.id
      this.competitive = game.competitive
    }
    if (this.engine.sessionId() === '') this.engine.startSession(game.id)
    const { accepted, filtered } = this.engine.accept(
      report.events,
      report.adapterId || report.source,
      checks
    )
    this.engine.record(filtered.map((f) => f.event))
    report = { ...report, events: accepted }
    const { fresh, held } = this.removeRepeats(report)
    const derived =
      report.source === 'screen'
        ? this.session.absorb(fresh, report.time)
        : this.memory.absorb({ ...report, events: fresh }, held)
    derived.push(...this.rules.absorb([...fresh, ...derived], report.time))
    if (report.source === 'screen' && report.fightEnded) {
      this.session.endFight()
      derived.push(...this.rules.endFight(report.time))
    }
    for (const event of derived) this.seen.set(eventKey(event), event.time)

    this.engine.stampDerived(derived)
    const events = [...fresh, ...derived]
    this.engine.record(events)
    const context = this.memory.context(this.now())
    for (const event of events) event.tier = sizeOf(event, context, game)
    this.director.offer(events)

    if (report.time >= this.newestFrame) {
      this.newestFrame = report.time
      this.lastSource = report.source
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
      // The screen checks only ever report something new as it happens, so a second death from
      // them is a second death, never the same death screen still up.
      const stillUp =
        report.source !== 'screen' &&
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
      if (!text || run !== this.run || !this.canSpeak()) {
        if (run === this.run) this.director.unsaid(decision)
        return null
      }
      this.deps.deliver(text, decision.events)
      // What it was about, never its words, so the log can be read against a play session.
      console.info(`Comment spoken for ${decision.events.map((e) => e.type).join(', ')}`)
      this.memory.rememberComment(text)
      this.director.spoke(decision, this.now())
      return text
    } catch (error) {
      console.error('Could not write a comment', error)
      this.director.unsaid(decision)
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
      tactical: decision.tactical,
      ...(this.lastSource === 'screen' ? { session: this.session.context(this.now()) } : {})
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

  // This session's events, oldest first, filtered ones included.
  history(): readonly GameEvent[] {
    return this.engine.history()
  }

  // How the last look at the game went, for deciding when to look again.
  isInFight(): boolean {
    return this.inFight
  }

  private startOver(): void {
    this.engine.reset()
    this.rules.reset()
    this.memory.startNewMatch()
    this.session.reset()
    this.lastSource = 'vision'
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
