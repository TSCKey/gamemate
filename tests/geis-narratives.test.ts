import { describe, expect, it } from 'vitest'
import { runRule } from '../src/main/geis/correlation'
import { closeCallSurvived } from '../src/main/geis/rules/closeCallSurvived'
import { newAreaAfterDeaths } from '../src/main/geis/rules/newAreaAfterDeaths'
import { Director } from '../src/main/companion/director'
import { Commentator, type CommentaryOptions } from '../src/main/companion/commentator'
import {
  certainty,
  claimsTooMuch,
  reactionPrompt,
  type ReactionRequest
} from '../src/main/companion/reaction'
import {
  makeEvent,
  type EventFields,
  type FrameReport,
  type GameEvent,
  type GameEventType
} from '../src/main/companion/events'

const S = 1000
const seen = (type: GameEventType, time: number, fields: EventFields = {}): GameEvent =>
  makeEvent(type, time, 'screen', { confidence: 0.9, ...fields })
const guessed = (type: GameEventType, time: number, fields: EventFields = {}): GameEvent =>
  makeEvent(type, time, 'vision', { confidence: 0.99, ...fields })

describe('a close call survived in a boss fight', () => {
  it('follows a boss title, the last mask and getting back above it', () => {
    const parts = [
      seen('boss_encounter', 0, { opponent: 'Lace' }),
      seen('low_health', 30 * S),
      seen('recovery', 34 * S)
    ]
    const [moment] = runRule(closeCallSurvived, parts)
    expect(moment).toMatchObject({
      type: 'close_call_survived',
      basis: 'inferred',
      opponent: 'Lace',
      related: parts.map((p) => p.id),
      data: { weakestBasis: 'verified' }
    })
  })

  it('needs a boss fight: a close call anywhere else is just a close call', () => {
    expect(runRule(closeCallSurvived, [seen('low_health', 0), seen('recovery', 5)])).toEqual([])
  })

  it('says nothing when the player died', () => {
    const script = [
      seen('boss_encounter', 0, { opponent: 'Lace' }),
      seen('low_health', 30),
      seen('death', 31),
      seen('recovery', 40)
    ]
    expect(runRule(closeCallSurvived, script)).toEqual([])
  })

  it('ends with the fight when the player leaves the room', () => {
    const script = [
      seen('boss_encounter', 0, { opponent: 'Lace' }),
      seen('low_health', 30),
      { fightEnded: 31 },
      seen('recovery', 40)
    ]
    expect(runRule(closeCallSurvived, script)).toEqual([])
  })

  it('never builds on a vision reading', () => {
    const script = [
      guessed('boss_encounter', 0, { opponent: 'Lace' }),
      guessed('low_health', 30),
      guessed('recovery', 34)
    ]
    expect(runRule(closeCallSurvived, script)).toEqual([])
  })

  it('counts each close call in a long fight once', () => {
    const script = [
      seen('boss_encounter', 0, { opponent: 'Lace' }),
      seen('low_health', 10 * S),
      seen('recovery', 12 * S),
      seen('recovery', 20 * S),
      seen('low_health', 40 * S),
      seen('recovery', 45 * S)
    ]
    expect(runRule(closeCallSurvived, script)).toHaveLength(2)
  })
})

describe('reaching a new area after dying in one', () => {
  const area = (time: number, place: string): GameEvent => seen('area_entered', time, { place })
  const death = (time: number, place = ''): GameEvent => seen('death', time, { place })

  it('follows three deaths in one area, then an area not seen before', () => {
    const script = [
      area(0, 'Moss Grotto'),
      death(10, 'Moss Grotto'),
      death(20),
      death(30),
      area(40, 'Bone Bottom')
    ]
    const [moment] = runRule(newAreaAfterDeaths, script)
    expect(moment).toMatchObject({
      type: 'new_area_after_deaths',
      place: 'Bone Bottom',
      count: 3,
      detail: 'reached Bone Bottom after dying 3 times in Moss Grotto',
      data: { from: 'Moss Grotto' }
    })
    expect(moment.related).toHaveLength(4)
  })

  it('does not take a respawn somewhere already visited for getting through', () => {
    const script = [
      area(0, 'Bone Bottom'),
      area(5, 'Moss Grotto'),
      death(10),
      death(20),
      death(30),
      area(40, 'Bone Bottom')
    ]
    expect(runRule(newAreaAfterDeaths, script)).toEqual([])
  })

  it('needs at least three deaths there', () => {
    const script = [area(0, 'Moss Grotto'), death(10), death(20), area(40, 'Bone Bottom')]
    expect(runRule(newAreaAfterDeaths, script)).toEqual([])
  })

  it('never builds on a vision reading', () => {
    const script = [
      guessed('area_entered', 0, { place: 'Moss Grotto' }),
      guessed('death', 10),
      guessed('death', 20),
      guessed('death', 30),
      guessed('area_entered', 40, { place: 'Bone Bottom' })
    ]
    expect(runRule(newAreaAfterDeaths, script)).toEqual([])
  })
})

describe('a bigger moment speaking for its parts', () => {
  it('takes its waiting parts out of the comments, without changing them otherwise', () => {
    const director = new Director()
    const low = seen('low_health', 0)
    const recovery = seen('recovery', 1)
    director.offer([low])
    const before = { ...low }
    const [moment] = runRule(closeCallSurvived, [
      seen('boss_encounter', -5, { opponent: 'Lace' }),
      low,
      recovery
    ])
    director.offer([recovery, moment])
    expect(low.commentary).toBe('superseded')
    expect(low.supersededBy).toBe(moment.id)
    expect(recovery.supersededBy).toBe(moment.id)
    expect({ ...low, commentary: before.commentary, supersededBy: undefined }).toEqual({
      ...before,
      supersededBy: undefined
    })
    expect(moment.commentary).toBe('pending')
  })

  it('leaves parts that were already spoken as spoken', () => {
    const director = new Director()
    const low = seen('low_health', 0)
    low.commentary = 'spoken'
    const [moment] = runRule(closeCallSurvived, [
      seen('boss_encounter', -5, { opponent: 'Lace' }),
      low,
      seen('recovery', 1)
    ])
    director.offer([moment])
    expect(low.commentary).toBe('spoken')
  })

  it('gives one comment for the whole moment in a Silksong session', async () => {
    let clock = 0
    const spoken: GameEvent[][] = []
    const replies = ['Here comes Lace.', 'One mask left and you are still swinging!']
    const commentator = new Commentator({
      now: () => clock,
      generate: async () => replies.shift() ?? '',
      deliver: (_text, events) => spoken.push(events)
    })
    const game = { id: 'silksong', name: 'Hollow Knight: Silksong', competitive: false }
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
      game
    }
    const report = (time: number, events: GameEvent[]): FrameReport => ({
      time,
      source: 'screen',
      adapterId: 'silksong',
      phase: 'playing',
      inFight: false,
      score: null,
      description: '',
      events
    })
    // The boss title gets its comment; the next ones wait for the gap after it.
    commentator.observe(report(0, [seen('boss_encounter', 0, { opponent: 'Lace' })]), game)
    clock = 4 * S
    await commentator.speakIfDue(options)
    commentator.observe(report(30 * S, [seen('low_health', 30 * S)]), game)
    commentator.observe(report(33 * S, [seen('recovery', 33 * S)]), game)
    clock = 36 * S
    await commentator.speakIfDue(options)
    clock = 80 * S
    await commentator.speakIfDue(options)
    expect(spoken.map((events) => events.map((e) => e.type))).toEqual([
      ['boss_encounter'],
      ['close_call_survived']
    ])
    const history = commentator.history().map((e) => [e.type, e.commentary])
    expect(history).toEqual([
      ['boss_encounter', 'spoken'],
      ['low_health', 'superseded'],
      ['recovery', 'superseded'],
      ['close_call_survived', 'spoken']
    ])
  })
})

describe('how sure a moment is worded', () => {
  it('states verified checks and the game’s own data as fact', () => {
    expect(certainty(seen('death', 0))).toBe('certain')
    expect(certainty(makeEvent('death', 0, 'vision', { basis: 'telemetry' }))).toBe('certain')
  })

  it('words a model’s reading as likely unless it was very sure', () => {
    expect(certainty(makeEvent('death', 0, 'vision', { confidence: 0.7 }))).toBe('likely')
    expect(certainty(makeEvent('kill', 0, 'vision', { confidence: 0.9 }))).toBe('certain')
  })

  it('words a worked-out moment built on a model’s reading as likely', () => {
    const built = makeEvent('kill_streak', 0, 'memory', {
      confidence: 0.9,
      data: { weakestBasis: 'model' }
    })
    expect(certainty(built)).toBe('likely')
  })

  it('tells the AI not to state a likely moment as fact', () => {
    const request = (event: GameEvent): ReactionRequest => ({
      game: { name: 'Minecraft', competitive: false },
      language: 'en',
      tier: 'minor',
      mood: 'negative',
      events: [event],
      context: {
        minutes: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        killStreak: 0,
        bestStreak: 0,
        roundRun: 0,
        score: null,
        nemesis: null,
        form: 'even',
        improving: false,
        pattern: null
      },
      recent: [],
      intensity: 'normal',
      humor: 'light',
      tactical: false
    })
    const likely = reactionPrompt(request(makeEvent('death', 0, 'vision', { confidence: 0.7 })))
    expect(likely).toMatch(/Likely, not certain/)
    expect(likely).toMatch(/do not say for certain/i)
    const sure = reactionPrompt(request(seen('death', 0)))
    expect(sure).not.toMatch(/Likely, not certain/)
    expect(sure).not.toMatch(/do not say for certain/i)
  })
})

describe('what a comment on a bigger moment may claim', () => {
  const close = makeEvent('close_call_survived', 0, 'memory')
  const onward = makeEvent('new_area_after_deaths', 0, 'memory')

  it('turns down how the player did it, which the checks never see', () => {
    expect(claimsTooMuch('What a dodge, still alive!', [close])).toBe(true)
    expect(claimsTooMuch('Nice heal there.', [close])).toBe(true)
    expect(claimsTooMuch('One mask left and still swinging!', [close])).toBe(false)
  })

  it('turns down beating anything after reaching a new area', () => {
    expect(claimsTooMuch('You finally defeated it!', [onward])).toBe(true)
    expect(claimsTooMuch('A whole new place after all that.', [onward])).toBe(false)
  })
})
