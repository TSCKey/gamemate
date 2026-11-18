// Sequence rules: small state machines that watch the ordered event stream and work out what
// follows from it (the fifth try at a boss, a close call survived). Each rule is a plain object
// with no ties to the engine, Electron or the AI, so it can be tested on its own with runRule.
//
// What a rule works out is a new event (basis 'inferred') that points at its parts through
// `related`. The parts are never changed.
import { makeEvent, type GameEvent, type GameEventType } from '../companion/events'

export type RuleScope = 'any' | 'competitive' | 'single-player'

// Why a rule's open match ended without a new event.
export type CloseReason = 'expired' | 'fight-ended' | 'session-end'

export interface Derived {
  type: GameEventType
  detail: string
  // The events it follows from, oldest first.
  related: string[]
  opponent?: string
  place?: string
  count?: number
  importance?: number
  // 0-1: how sure the rule is, given that its parts are right. 1 for counting.
  certainty?: number
  data?: Record<string, string | number | boolean>
}

export interface RuleStep<S> {
  // null: this match is finished and forgotten.
  state: S | null
  emit?: Derived[]
}

export interface CorrelationRule<S = unknown> {
  id: string
  scope: RuleScope
  listensTo: readonly GameEventType[]
  // The evidence its parts need: 'confirmed' takes only the game's data or verified checks, so a
  // model's reading can never complete it. 'any' also takes model readings.
  needs: 'confirmed' | 'any'
  // Several matches at once, one per key (per boss, per opponent). One match when absent.
  key?: (event: GameEvent) => string
  // A match is forgotten this long after its last step.
  windowMs: number
  // At most this many matches are kept; the oldest goes first.
  maxInstances?: number
  // Its matches end with the fight (a room change ends a boss fight in Silksong).
  endsWithFight?: boolean
  init(): S
  // Each relevant event, in the order things happened.
  step(state: S, event: GameEvent): RuleStep<S>
  // The fight ended, the match expired or the session ended.
  close?(state: S, reason: CloseReason): Derived[]
}

const DEFAULT_MAX_INSTANCES = 16
// Rules can listen to what other rules work out, at most this deep.
const MAX_DEPTH = 3
const CONFIRMED = new Set<GameEvent['basis']>(['telemetry', 'verified'])

interface Instance {
  state: unknown
  lastStep: number
}

// The evidence a rule's parts must have, given what the parts themselves rest on. A worked-out
// part counts as confirmed only if everything it came from was.
export function weakestBasis(parts: readonly GameEvent[]): GameEvent['basis'] {
  const order: GameEvent['basis'][] = ['model', 'inferred', 'verified', 'telemetry']
  let weakest: GameEvent['basis'] = 'telemetry'
  for (const part of parts) {
    const basis =
      part.basis === 'inferred'
        ? ((part.data?.weakestBasis as GameEvent['basis']) ?? 'inferred')
        : part.basis
    if (order.indexOf(basis) < order.indexOf(weakest)) weakest = basis
  }
  return weakest
}

export class CorrelationEngine {
  private instances = new Map<string, Map<string, Instance>>()
  private byType = new Map<GameEventType, CorrelationRule[]>()
  // What every event seen this session rested on, for working out a derived event's evidence.
  private seen = new Map<string, GameEvent>()

  constructor(
    private readonly rules: readonly CorrelationRule[],
    private readonly scopeOf: () => 'competitive' | 'single-player'
  ) {
    for (const rule of rules) {
      for (const type of rule.listensTo) {
        this.byType.set(type, [...(this.byType.get(type) ?? []), rule])
      }
    }
  }

  // Runs the rules over new events (in the order they happened) and returns what they worked
  // out, already made into events.
  absorb(events: readonly GameEvent[], now: number): GameEvent[] {
    const out: GameEvent[] = []
    let batch = [...events].sort((a, b) => a.time - b.time)
    for (let depth = 0; depth < MAX_DEPTH && batch.length > 0; depth++) {
      const next: GameEvent[] = []
      for (const event of batch) {
        this.remember(event)
        for (const rule of this.byType.get(event.type) ?? []) {
          next.push(...this.stepRule(rule, event))
        }
      }
      out.push(...next)
      batch = next
    }
    out.push(...this.expire(now))
    return out
  }

  // Leaving a room (or any other end of a fight with no word on how) closes open matches.
  endFight(now: number): GameEvent[] {
    return this.closeAll('fight-ended', now)
  }

  endSession(now: number): GameEvent[] {
    const out = this.closeAll('session-end', now)
    this.reset()
    return out
  }

  reset(): void {
    this.instances.clear()
    this.seen.clear()
  }

  private remember(event: GameEvent): void {
    this.seen.set(event.id, event)
    if (this.seen.size > 400) this.seen.delete(this.seen.keys().next().value as string)
  }

  private applies(rule: CorrelationRule, event: GameEvent): boolean {
    if (rule.scope !== 'any' && rule.scope !== this.scopeOf()) return false
    if (event.status !== 'accepted') return false
    if (rule.needs === 'confirmed' && !CONFIRMED.has(weakestBasis([event]))) return false
    return true
  }

  private stepRule(rule: CorrelationRule, event: GameEvent): GameEvent[] {
    if (!this.applies(rule, event)) return []
    const matches = this.instances.get(rule.id) ?? new Map<string, Instance>()
    this.instances.set(rule.id, matches)
    const key = rule.key?.(event) ?? ''
    const open = matches.get(key)
    const state = open && event.time - open.lastStep <= rule.windowMs ? open.state : rule.init()
    const result = rule.step(state, event)
    matches.delete(key)
    if (result.state !== null) {
      matches.set(key, { state: result.state, lastStep: event.time })
      while (matches.size > (rule.maxInstances ?? DEFAULT_MAX_INSTANCES)) {
        matches.delete(matches.keys().next().value as string)
      }
    }
    return (result.emit ?? []).map((d) => this.toEvent(rule, d, event.time))
  }

  private expire(now: number): GameEvent[] {
    const out: GameEvent[] = []
    for (const rule of this.rules) {
      const matches = this.instances.get(rule.id)
      if (!matches) continue
      for (const [key, open] of matches) {
        if (now - open.lastStep <= rule.windowMs) continue
        matches.delete(key)
        const closed = rule.close?.(open.state, 'expired') ?? []
        out.push(...closed.map((d) => this.toEvent(rule, d, now)))
      }
    }
    return out
  }

  private closeAll(reason: CloseReason, now: number): GameEvent[] {
    const out: GameEvent[] = []
    for (const rule of this.rules) {
      const matches = this.instances.get(rule.id)
      if (!matches || (reason === 'fight-ended' && !rule.endsWithFight)) continue
      for (const open of matches.values()) {
        const closed = rule.close?.(open.state, reason) ?? []
        out.push(...closed.map((d) => this.toEvent(rule, d, now)))
      }
      matches.clear()
    }
    return out
  }

  private toEvent(rule: CorrelationRule, derived: Derived, time: number): GameEvent {
    const parts = derived.related.flatMap((id) => this.seen.get(id) ?? [])
    const confidence = Math.min(1, ...parts.map((p) => p.confidence)) * (derived.certainty ?? 1)
    const event = makeEvent(derived.type, time, 'memory', {
      basis: 'inferred',
      confidence,
      detail: derived.detail,
      related: derived.related,
      opponent: derived.opponent ?? '',
      place: derived.place ?? '',
      count: derived.count ?? 1,
      ...(derived.importance !== undefined ? { importance: derived.importance } : {}),
      data: { rule: rule.id, weakestBasis: weakestBasis(parts), ...derived.data }
    })
    event.adapterId = `rule:${rule.id}`
    return event
  }
}

// Runs one rule on its own over a script of events, for its tests: what it worked out, in order.
export function runRule(
  rule: CorrelationRule,
  script: readonly (GameEvent | { fightEnded: number } | { sessionEnd: number })[],
  scope: 'competitive' | 'single-player' = 'single-player'
): GameEvent[] {
  const engine = new CorrelationEngine([rule], () => scope)
  const out: GameEvent[] = []
  for (const item of script) {
    if ('fightEnded' in item) out.push(...engine.endFight(item.fightEnded))
    else if ('sessionEnd' in item) out.push(...engine.endSession(item.sessionEnd))
    else out.push(...engine.absorb([item], item.time))
  }
  return out
}
