// The event engine: where every adapter's events enter the pipeline. It checks them, stamps the
// session and adapter on them, applies the evidence rules and keeps the session's history.
// Nothing here knows how a game is read.
//
// Events are never rewritten after this point: only their commentary status changes (in the
// Director). Bigger moments worked out from them are new events that point back through
// `related`, so the originals stay in history as they were.
import {
  EVIDENCE_BASES,
  type EvidenceBasis,
  type GameEvent,
  type GameEventType
} from '../companion/events'

const MAX_HISTORY = 200

// Below this confidence an event is kept in history as filtered: never commented on and never
// part of a bigger moment. Set per basis, never derived from it.
export const MIN_CONFIDENCE: Record<EvidenceBasis, number> = {
  telemetry: 0,
  verified: 0.5,
  model: 0.5,
  inferred: 0.5
}

// Why an event was filtered, for the history and the developer inspector.
export type FilterReason = 'low-confidence' | 'model-only-where-checks-exist'

export interface Accepted {
  // Events to comment on and remember.
  accepted: GameEvent[]
  // Events only kept in history, with why.
  filtered: { event: GameEvent; reason: FilterReason }[]
}

export class EventEngine {
  private events: GameEvent[] = []
  private session = ''
  private game = ''
  private sessions = 0

  constructor(private readonly now: () => number = () => Date.now()) {}

  // One stretch of play of one game. Called when the game changes or after forgetting.
  startSession(gameId: string): string {
    this.game = gameId
    this.session = `${gameId}-${new Date(this.now()).toISOString()}-${++this.sessions}`
    this.events = []
    return this.session
  }

  sessionId(): string {
    return this.session
  }

  // Checks and stamps what one adapter reported. `checks` lists the types its adapter verifies
  // itself: where it does, a vision model's reading of that type can't make the event alone.
  accept(
    events: GameEvent[],
    adapterId: string,
    checks: ReadonlySet<GameEventType> = new Set()
  ): Accepted {
    const result: Accepted = { accepted: [], filtered: [] }
    for (const event of events) {
      this.stamp(event, adapterId)
      const reason = this.filterReason(event, checks)
      if (reason) {
        event.status = 'filtered'
        event.commentary = 'filtered'
        result.filtered.push({ event, reason })
      } else {
        result.accepted.push(event)
      }
    }
    return result
  }

  // Events worked out from others (by memory or sequence rules) get the same stamp.
  stampDerived(events: GameEvent[]): void {
    for (const event of events) this.stamp(event, event.adapterId || 'memory')
  }

  // Keeps events in history, in the order they happened.
  record(events: readonly GameEvent[]): void {
    if (events.length === 0) return
    this.events = [...this.events, ...events].sort((a, b) => a.time - b.time).slice(-MAX_HISTORY)
  }

  history(): readonly GameEvent[] {
    return this.events
  }

  byId(id: string): GameEvent | undefined {
    return this.events.find((e) => e.id === id)
  }

  // The events a bigger moment was worked out from, as kept in history.
  partsOf(event: GameEvent): GameEvent[] {
    return event.related.flatMap((id) => this.byId(id) ?? [])
  }

  reset(): void {
    this.events = []
    this.session = ''
    this.game = ''
  }

  private stamp(event: GameEvent, adapterId: string): void {
    event.sessionId = this.session
    event.gameId = this.game
    if (!event.adapterId) event.adapterId = adapterId
    if (!EVIDENCE_BASES.includes(event.basis)) event.basis = 'model'
    const confidence = Number(event.confidence)
    event.confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0
  }

  private filterReason(event: GameEvent, checks: ReadonlySet<GameEventType>): FilterReason | null {
    if (event.basis === 'model' && checks.has(event.type)) return 'model-only-where-checks-exist'
    if (event.confidence < MIN_CONFIDENCE[event.basis]) return 'low-confidence'
    return null
  }
}
