import { describe, expect, it } from 'vitest'
import { CorrelationEngine, runRule, type CorrelationRule } from '../src/main/geis/correlation'
import { attemptMilestones } from '../src/main/geis/rules/attemptMilestones'
import {
  makeEvent,
  type EventFields,
  type GameEvent,
  type GameEventType
} from '../src/main/companion/events'

const screen = (type: GameEventType, time: number, fields: EventFields = {}): GameEvent =>
  makeEvent(type, time, 'screen', { confidence: 0.9, ...fields })
const boss = (time: number, name = 'Moss Mother'): GameEvent =>
  screen('boss_encounter', time, { opponent: name })

// Counts kills per opponent and says so at two; ends with the fight.
const twice: CorrelationRule<{ ids: string[] }> = {
  id: 'twice',
  scope: 'any',
  listensTo: ['kill'],
  needs: 'any',
  key: (e) => e.opponent,
  windowMs: 10_000,
  maxInstances: 2,
  endsWithFight: true,
  init: () => ({ ids: [] }),
  step(state, e) {
    const ids = [...state.ids, e.id]
    if (ids.length < 2) return { state: { ids } }
    return { state: null, emit: [{ type: 'kill_streak', detail: 'two', related: ids, count: 2 }] }
  }
}

const kill = (time: number, opponent = 'Sova', fields: EventFields = {}): GameEvent =>
  makeEvent('kill', time, 'vision', { confidence: 0.8, opponent, ...fields })

describe('the sequence rule runner', () => {
  it('only gives a rule the events it listens to', () => {
    expect(runRule(twice, [screen('death', 1), screen('death', 2)])).toEqual([])
  })

  it('keeps one match per key', () => {
    const out = runRule(twice, [kill(1, 'Sova'), kill(2, 'Jett'), kill(3, 'Sova')])
    expect(out.map((e) => e.related.length)).toEqual([2])
  })

  it('forgets a match after its window', () => {
    expect(runRule(twice, [kill(0), kill(20_000)])).toEqual([])
  })

  it('keeps at most the matches a rule allows, dropping the oldest', () => {
    const out = runRule(twice, [kill(1, 'A'), kill(2, 'B'), kill(3, 'C'), kill(4, 'A')])
    expect(out).toEqual([])
  })

  it('ends a match with the fight when the rule says so', () => {
    expect(runRule(twice, [kill(1), { fightEnded: 2 }, kill(3)])).toEqual([])
  })

  it('makes what it works out an inferred event that points at its parts', () => {
    const parts = [kill(1), kill(2, 'Sova', { confidence: 0.6 })]
    const [streak] = runRule(twice, parts)
    expect(streak).toMatchObject({
      type: 'kill_streak',
      basis: 'inferred',
      source: 'memory',
      related: parts.map((p) => p.id),
      adapterId: 'rule:twice',
      data: { rule: 'twice', weakestBasis: 'model' }
    })
    // As sure as its least sure part.
    expect(streak.confidence).toBeCloseTo(0.6)
  })

  it('leaves the parts exactly as they were', () => {
    const parts = [kill(1), kill(2)]
    const before = JSON.stringify(parts)
    runRule(twice, parts)
    expect(JSON.stringify(parts)).toBe(before)
  })

  it('never completes a rule that needs confirmed parts with a model reading', () => {
    const confirmed: CorrelationRule = { ...twice, needs: 'confirmed' }
    expect(runRule(confirmed, [kill(1), kill(2)])).toEqual([])
    const read = (t: number): GameEvent => makeEvent('kill', t, 'screen', { opponent: 'Sova' })
    expect(runRule(confirmed, [read(1), read(2)])).toHaveLength(1)
  })

  it('runs a rule only in games of its scope', () => {
    const competitive: CorrelationRule = { ...twice, scope: 'competitive' }
    expect(runRule(competitive, [kill(1), kill(2)], 'single-player')).toEqual([])
    expect(runRule(competitive, [kill(1), kill(2)], 'competitive')).toHaveLength(1)
  })

  it('skips events that were filtered out', () => {
    const filtered = kill(2)
    filtered.status = 'filtered'
    expect(runRule(twice, [kill(1), filtered])).toEqual([])
  })

  it('lets rules listen to what other rules work out, but not forever', () => {
    // Every kill_streak makes another kill_streak: the runner stops after three rounds.
    const echo: CorrelationRule<null> = {
      id: 'echo',
      scope: 'any',
      listensTo: ['kill_streak'],
      needs: 'any',
      windowMs: 1000,
      init: () => null,
      step: (_s, e) => ({
        state: null,
        emit: [{ type: 'kill_streak', detail: 'again', related: [e.id] }]
      })
    }
    const engine = new CorrelationEngine([twice, echo], () => 'competitive')
    engine.absorb([kill(1)], 1)
    const out = engine.absorb([kill(2)], 2)
    expect(out).toHaveLength(3)
  })
})

describe('attempt milestones', () => {
  it('announces a milestone once, at attempt 5', () => {
    const derived = runRule(
      attemptMilestones,
      Array.from({ length: 7 }, (_, i) => boss(i * 100_000))
    )
    const milestones = derived.filter((e) => e.type === 'milestone')
    expect(milestones).toHaveLength(1)
    expect(milestones[0].detail).toBe('attempt 5 at Moss Mother')
  })

  it('announces milestones at 10 and 20 as well', () => {
    const derived = runRule(
      attemptMilestones,
      Array.from({ length: 20 }, (_, i) => boss(i * 100_000))
    )
    expect(derived.map((e) => e.detail)).toEqual([
      'attempt 5 at Moss Mother',
      'attempt 10 at Moss Mother',
      'attempt 20 at Moss Mother'
    ])
  })

  it('counts each boss on its own, whatever the case of its name', () => {
    const script = [
      ...Array.from({ length: 4 }, (_, i) => boss(i, 'Moss Mother')),
      boss(10, 'Bell Beast'),
      boss(11, 'MOSS MOTHER')
    ]
    const [milestone] = runRule(attemptMilestones, script)
    expect(milestone).toMatchObject({ count: 5, opponent: 'MOSS MOTHER', importance: 8 })
    expect(milestone.related).toHaveLength(5)
  })

  it('only counts verified titles, never a model reading', () => {
    const guessed = Array.from({ length: 5 }, (_, i) =>
      makeEvent('boss_encounter', i, 'vision', { opponent: 'Moss Mother' })
    )
    expect(runRule(attemptMilestones, guessed)).toEqual([])
  })

  it('counts nothing in competitive games', () => {
    const script = Array.from({ length: 5 }, (_, i) => boss(i))
    expect(runRule(attemptMilestones, script, 'competitive')).toEqual([])
  })
})
