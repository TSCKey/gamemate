import { describe, expect, it } from 'vitest'
import { EventEngine, MIN_CONFIDENCE } from '../src/main/geis/engine'
import { Commentator, type CommentaryOptions } from '../src/main/companion/commentator'
import {
  makeEvent,
  normalizeVisionReport,
  SURE_LOOK_CONFIDENCE,
  type EventFields,
  type FrameReport,
  type GameEvent,
  type GameEventType
} from '../src/main/companion/events'
import { COPIED_TEXT_CONFIDENCE, readAreas } from '../src/main/companion/areaReading'

const event = (
  type: GameEventType,
  time: number,
  source: GameEvent['source'],
  fields: EventFields = {}
): GameEvent => makeEvent(type, time, source, fields)

describe('the event engine', () => {
  it('stamps the session, the game and the adapter on what it accepts', () => {
    const engine = new EventEngine(() => Date.UTC(2026, 10, 18, 14, 10))
    const session = engine.startSession('silksong')
    const { accepted } = engine.accept([event('death', 1, 'screen')], 'silksong')
    expect(session).toMatch(/^silksong-2026-11-18T14:10:00\.000Z-\d+$/)
    expect(accepted[0]).toMatchObject({
      sessionId: session,
      gameId: 'silksong',
      adapterId: 'silksong',
      status: 'accepted'
    })
  })

  it('starts each session with a different name and an empty history', () => {
    const engine = new EventEngine(() => 0)
    const first = engine.startSession('silksong')
    engine.record(engine.accept([event('death', 1, 'screen')], 'silksong').accepted)
    const second = engine.startSession('silksong')
    expect(second).not.toBe(first)
    expect(engine.history()).toEqual([])
  })

  it('keeps confidence and evidence apart: a sure model reading is still a model reading', () => {
    const engine = new EventEngine()
    engine.startSession('v')
    const { accepted } = engine.accept(
      [event('kill', 1, 'vision', { confidence: 0.99 })],
      'killfeed'
    )
    expect(accepted[0]).toMatchObject({ basis: 'model', confidence: 0.99 })
  })

  it('keeps a weak verified reading verified, and filters it only by its confidence', () => {
    const engine = new EventEngine()
    engine.startSession('silksong')
    const weak = MIN_CONFIDENCE.verified - 0.1
    const { accepted, filtered } = engine.accept(
      [event('boss_encounter', 1, 'screen', { confidence: weak })],
      'silksong'
    )
    expect(accepted).toEqual([])
    expect(filtered[0].reason).toBe('low-confidence')
    expect(filtered[0].event).toMatchObject({
      basis: 'verified',
      status: 'filtered',
      commentary: 'filtered'
    })
  })

  it('never lets a vision reading make an event its adapter checks itself', () => {
    const engine = new EventEngine()
    engine.startSession('silksong')
    const checks = new Set<GameEventType>(['death'])
    const { accepted, filtered } = engine.accept(
      [
        event('death', 1, 'vision', { confidence: 1 }),
        event('death', 2, 'screen', { confidence: 0.9 })
      ],
      'silksong',
      checks
    )
    expect(accepted.map((e) => e.basis)).toEqual(['verified'])
    expect(filtered.map((f) => f.reason)).toEqual(['model-only-where-checks-exist'])
  })

  it('accepts vision readings in games without checks of their own', () => {
    const engine = new EventEngine()
    engine.startSession('minecraft')
    const { accepted } = engine.accept([event('death', 1, 'vision', { confidence: 0.7 })], 'look')
    expect(accepted).toHaveLength(1)
  })

  it('clamps confidence to 0-1 and treats a missing number as no confidence', () => {
    const engine = new EventEngine()
    engine.startSession('g')
    const high = event('kill', 1, 'vision', { confidence: 3 })
    const missing = event('kill', 2, 'vision', { confidence: Number.NaN })
    engine.accept([high, missing], 'x')
    expect([high.confidence, missing.confidence]).toEqual([1, 0])
  })

  it('keeps history in the order things happened, and never more than 200', () => {
    const engine = new EventEngine()
    engine.startSession('g')
    engine.record([event('kill', 30, 'vision'), event('kill', 10, 'vision')])
    expect(engine.history().map((e) => e.time)).toEqual([10, 30])
    engine.record(Array.from({ length: 250 }, (_, i) => event('kill', 100 + i, 'vision')))
    expect(engine.history()).toHaveLength(200)
    expect(engine.history()[199].time).toBe(349)
  })

  it('finds the events a worked-out moment came from, unchanged', () => {
    const engine = new EventEngine()
    engine.startSession('g')
    const parts = [event('kill', 1, 'vision'), event('kill', 2, 'vision')]
    const streak = event('kill_streak', 3, 'memory', { related: parts.map((p) => p.id) })
    engine.record([...parts, streak])
    expect(engine.partsOf(streak)).toEqual(parts)
    expect(parts.every((p) => p.type === 'kill' && p.basis === 'model')).toBe(true)
  })
})

describe('what each source says about its evidence', () => {
  it('gives sure whole-screen readings the model basis and a modest confidence', () => {
    const report = normalizeVisionReport(
      {
        phase: 'playing',
        events: [
          {
            type: 'death',
            sure: true,
            importance: 5,
            detail: 'YOU DIED',
            opponent: '',
            place: '',
            count: 1
          }
        ]
      },
      1
    )
    expect(report.events[0]).toMatchObject({
      basis: 'model',
      confidence: SURE_LOOK_CONFIDENCE
    })
  })

  it('gives kill-feed readings the model basis with the copied-text confidence', () => {
    const report = readAreas({ feed_lines: [{ left: 'Me', right: 'Sova' }] }, 1, ['Me'])
    expect(report.events[0]).toMatchObject({
      type: 'kill',
      basis: 'model',
      confidence: COPIED_TEXT_CONFIDENCE
    })
  })

  it('marks what memory works out as inferred', () => {
    expect(event('kill_streak', 1, 'memory').basis).toBe('inferred')
  })
})

describe('what became of each event', () => {
  const options: CommentaryOptions = {
    frequency: 'normal',
    intensity: 'normal',
    humor: 'light',
    categories: {
      combat: true,
      skill: true,
      teamwork: true,
      objectives: true,
      match: true,
      world: true
    },
    tactics: false,
    language: 'en',
    game: { id: 'minecraft', name: 'Minecraft', competitive: false }
  }
  const report = (time: number, events: GameEvent[]): FrameReport => ({
    time,
    source: 'vision',
    adapterId: 'vision-look',
    phase: 'playing',
    inFight: false,
    score: null,
    description: '',
    events
  })

  function setup(reply = 'Ouch, that one stung.'): {
    commentator: Commentator
    setClock: (t: number) => void
  } {
    let clock = 0
    const commentator = new Commentator({
      now: () => clock,
      generate: async () => reply,
      deliver: () => {}
    })
    return { commentator, setClock: (t) => (clock = t) }
  }

  it('marks a commented event spoken and keeps it in history', async () => {
    const { commentator, setClock } = setup()
    const death = event('death', 1000, 'vision', { confidence: 0.7 })
    commentator.observe(report(1000, [death]), options.game)
    expect(death.commentary).toBe('pending')
    setClock(1500)
    await commentator.speakIfDue(options)
    expect(death.commentary).toBe('spoken')
    expect(commentator.history()).toContain(death)
    expect(death.sessionId).toMatch(/^minecraft-/)
  })

  it('marks an event of a switched-off kind filtered, and one left too long stale', async () => {
    const { commentator, setClock } = setup()
    const find = event('discovery', 1000, 'vision', { importance: 9 })
    commentator.observe(report(1000, [find]), options.game)
    await commentator.speakIfDue({
      ...options,
      categories: { ...options.categories, world: false }
    })
    expect(find.commentary).toBe('filtered')

    const fight = event('fight_won', 2000, 'vision')
    commentator.observe(report(2000, [fight]), options.game)
    setClock(2000 + 10 * 60_000)
    await commentator.speakIfDue(options)
    expect(fight.commentary).toBe('stale')
  })

  it('marks events unsaid when nothing usable was written', async () => {
    const { commentator, setClock } = setup('')
    const death = event('death', 1000, 'vision')
    commentator.observe(report(1000, [death]), options.game)
    setClock(1500)
    await commentator.speakIfDue(options)
    expect(death.commentary).toBe('none')
  })

  it('keeps a vision reading of a checked type out of the comments', async () => {
    const { commentator, setClock } = setup()
    const death = event('death', 1000, 'vision', { confidence: 1 })
    const fresh = commentator.observe(report(1000, [death]), options.game, new Set(['death']))
    setClock(1500)
    expect(fresh).toEqual([])
    expect(await commentator.speakIfDue(options)).toBeNull()
    expect(commentator.history()).toContain(death)
    expect(death.status).toBe('filtered')
  })
})
