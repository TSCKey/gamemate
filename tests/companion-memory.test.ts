import { describe, expect, it } from 'vitest'
import {
  makeEvent,
  type FrameReport,
  type GameEvent,
  type GameEventType
} from '../src/main/companion/events'
import { MatchMemory } from '../src/main/companion/matchMemory'

const event = (type: GameEventType, time: number, fields: Partial<GameEvent> = {}): GameEvent =>
  makeEvent(type, time, 'vision', fields)

const frame = (
  time: number,
  events: GameEvent[],
  over: Partial<FrameReport> = {}
): FrameReport => ({
  time,
  source: 'vision',
  phase: 'playing',
  inFight: false,
  score: null,
  description: '',
  events,
  ...over
})

// Feeds a list of event types, one per 15 seconds, and collects what memory works out.
function play(memory: MatchMemory, types: GameEventType[], start = 0): GameEvent[] {
  return types.flatMap((type, i) => {
    const time = start + i * 15_000
    return memory.absorb(frame(time, [event(type, time)]))
  })
}

describe('recognising kill streaks', () => {
  it('announces a streak once three kills pass without a death', () => {
    const memory = new MatchMemory()
    const derived = play(memory, ['kill', 'kill', 'kill'])
    expect(derived.map((e) => e.type)).toEqual(['kill_streak'])
    expect(derived[0].count).toBe(3)
    expect(memory.context(45_000).killStreak).toBe(3)
  })

  it('does not announce the same streak twice', () => {
    const memory = new MatchMemory()
    const derived = play(memory, ['kill', 'kill', 'kill', 'kill'])
    expect(derived.filter((e) => e.type === 'kill_streak')).toHaveLength(1)
  })

  it('starts counting again after a death, and keeps the best streak', () => {
    const memory = new MatchMemory()
    play(memory, ['kill', 'kill', 'kill', 'death', 'kill'])
    const context = memory.context(75_000)
    expect(context.killStreak).toBe(1)
    expect(context.bestStreak).toBe(3)
  })

  it('counts one kill when the same elimination is reported as a kill and a headshot', () => {
    const memory = new MatchMemory()
    memory.absorb(
      frame(0, [event('kill', 0, { opponent: 'Sova' }), event('headshot', 0, { opponent: 'Sova' })])
    )
    expect(memory.context(0).kills).toBe(1)
  })

  it('does not count the kills of a growing multikill twice', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('kill', 0)]))
    memory.absorb(frame(10_000, [event('multikill', 10_000, { count: 3 })]))
    expect(memory.context(10_000).kills).toBe(3)
  })

  it('gets the streak right when events arrive out of order', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(30_000, [event('kill', 30_000)]))
    memory.absorb(frame(0, [event('kill', 0)]))
    memory.absorb(frame(15_000, [event('death', 15_000)]))
    expect(memory.context(30_000).killStreak).toBe(1)
  })
})

describe('recognising patterns across a match', () => {
  it('notices dying to the same opponent again', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('death', 0, { opponent: 'Reyna' })]))
    expect(memory.context(0).nemesis).toBeNull()
    memory.absorb(frame(60_000, [event('death', 60_000, { opponent: 'REYNA' })]))
    expect(memory.context(60_000).nemesis).toEqual({ name: 'REYNA', count: 2 })
  })

  it('notices dying in the same named place, as a repeated mistake', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('death', 0, { place: 'A Main' })]))
    memory.absorb(frame(90_000, [event('death', 90_000, { place: 'A Main' })]))
    expect(memory.context(90_000).pattern).toEqual({
      kind: 'same_place',
      place: 'A Main',
      count: 2
    })
  })

  it('notices several deaths close together', () => {
    const memory = new MatchMemory()
    play(memory, ['death', 'death', 'death'])
    expect(memory.context(30_000).pattern).toMatchObject({ kind: 'quick_deaths', count: 3 })
  })

  it('has nothing to say about patterns without evidence', () => {
    const memory = new MatchMemory()
    play(memory, ['kill', 'death'])
    expect(memory.context(15_000).pattern).toBeNull()
  })

  it('recognises a hard match', () => {
    const memory = new MatchMemory()
    play(memory, ['death', 'kill', 'death', 'death', 'death'])
    expect(memory.context(60_000).form).toBe('hard')
  })

  it('recognises an unusually good match', () => {
    const memory = new MatchMemory()
    play(memory, ['kill', 'kill', 'death', 'kill', 'kill', 'kill', 'kill'])
    expect(memory.context(90_000).form).toBe('great')
  })

  it('recognises consistently good plays', () => {
    const memory = new MatchMemory()
    play(memory, ['death', 'assist', 'objective_won', 'round_won', 'assist'])
    expect(memory.context(60_000).form).toBe('good')
  })

  it('says nothing about form from one or two events', () => {
    const memory = new MatchMemory()
    play(memory, ['death'])
    expect(memory.context(0).form).toBe('even')
  })

  it('recognises improvement over the match', () => {
    const memory = new MatchMemory()
    play(memory, [
      'death',
      'death',
      'kill',
      'death',
      'kill',
      'death',
      'kill',
      'kill',
      'kill',
      'kill'
    ])
    expect(memory.context(135_000).improving).toBe(true)
  })
})

describe('reading the score', () => {
  const scored = (memory: MatchMemory, time: number, own: number, enemy: number): GameEvent[] =>
    memory.absorb(frame(time, [], { score: { own, enemy } }))

  it('recognises a team comeback once', () => {
    const memory = new MatchMemory()
    const derived = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
      [5, 4]
    ].flatMap(([own, enemy], i) => scored(memory, i * 60_000, own, enemy))
    const comebacks = derived.filter((e) => e.type === 'comeback')
    expect(comebacks).toHaveLength(1)
    expect(comebacks[0].detail).toMatch(/1-4/)
    expect(comebacks[0].detail).toMatch(/4-4/)
  })

  it('counts a round from the score when no banner was caught', () => {
    const memory = new MatchMemory()
    scored(memory, 0, 2, 2)
    const derived = scored(memory, 60_000, 3, 2)
    expect(derived.map((e) => e.type)).toEqual(['round_won'])
    expect(memory.context(60_000).roundRun).toBe(1)
  })

  it('does not count a round twice when the banner and the score both show it', () => {
    const memory = new MatchMemory()
    scored(memory, 0, 2, 2)
    memory.absorb(frame(30_000, [event('round_won', 30_000)]))
    const derived = scored(memory, 40_000, 3, 2)
    expect(derived).toEqual([])
    expect(memory.context(40_000).roundRun).toBe(1)
  })

  it('recognises a run of won rounds and a run of lost rounds', () => {
    const memory = new MatchMemory()
    const wins = play(memory, ['round_won', 'round_won', 'round_won'])
    expect(wins.map((e) => e.type)).toEqual(['win_streak'])
    const losses = play(memory, ['round_lost', 'round_lost', 'round_lost'], 60_000)
    expect(losses.map((e) => e.type)).toEqual(['loss_streak'])
  })

  it('ignores a one-off misread of the score', () => {
    const memory = new MatchMemory()
    scored(memory, 0, 2, 2)
    expect(scored(memory, 30_000, 12, 2)).toEqual([])
    expect(memory.context(30_000).score).toEqual({ own: 2, enemy: 2 })
  })

  it('believes a surprising score once it is read twice', () => {
    const memory = new MatchMemory()
    scored(memory, 0, 2, 2)
    scored(memory, 30_000, 8, 5)
    const derived = scored(memory, 60_000, 8, 5)
    expect(memory.context(60_000).score).toEqual({ own: 8, enemy: 5 })
    expect(derived).toEqual([])
  })

  it('ignores an older reading that arrives late', () => {
    const memory = new MatchMemory()
    scored(memory, 60_000, 3, 3)
    scored(memory, 30_000, 2, 3)
    expect(memory.context(60_000).score).toEqual({ own: 3, enemy: 3 })
  })
})

describe('surviving a close call', () => {
  it('notes a recovery after low health passes without a death', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('low_health', 0)]))
    const derived = memory.absorb(frame(20_000, []))
    expect(derived.map((e) => e.type)).toEqual(['recovery'])
  })

  it('does not call it a recovery while the health is still low', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('low_health', 0)]))
    expect(memory.absorb(frame(20_000, [], {}), new Set(['low_health']))).toEqual([])
  })

  it('does not call it a recovery after a death', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('low_health', 0)]))
    memory.absorb(frame(10_000, [event('death', 10_000)]))
    expect(memory.absorb(frame(30_000, []))).toEqual([])
  })
})

describe('the size and life of match memory', () => {
  it('stays small however long the match runs', () => {
    const memory = new MatchMemory()
    for (let i = 0; i < 2000; i++) {
      const time = i * 1000
      memory.absorb(
        frame(time, [event('death', time, { opponent: `Player${i}`, place: `Place${i}` })])
      )
      memory.rememberComment(`comment ${i}`)
    }
    const size = memory.size()
    expect(size.events).toBeLessThanOrEqual(48)
    expect(size.opponents).toBeLessThanOrEqual(8)
    expect(size.places).toBeLessThanOrEqual(8)
    expect(size.comments).toBeLessThanOrEqual(8)
  })

  it('remembers comments past each reaction, newest last', () => {
    const memory = new MatchMemory()
    memory.rememberComment('first')
    memory.rememberComment('second')
    expect(memory.recentComments()).toEqual(['first', 'second'])
  })

  it('starts fresh after the match ends and play resumes', () => {
    const memory = new MatchMemory()
    play(memory, ['kill', 'kill', 'victory'])
    memory.absorb(frame(120_000, [], { phase: 'playing' }))
    expect(memory.context(120_000).kills).toBe(0)
  })

  it('keeps counting on the victory screen itself', () => {
    const memory = new MatchMemory()
    play(memory, ['kill', 'kill', 'victory'])
    memory.absorb(frame(35_000, [], { phase: 'intermission' }))
    expect(memory.context(35_000).kills).toBe(2)
  })

  it('starts fresh when the score goes back to zero', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [event('kill', 0)], { score: { own: 7, enemy: 6 } }))
    memory.absorb(frame(30_000, [], { score: { own: 0, enemy: 0 } }))
    expect(memory.context(30_000).kills).toBe(0)
  })

  it('starts fresh after a long break', () => {
    const memory = new MatchMemory()
    play(memory, ['kill'])
    memory.absorb(frame(11 * 60_000, []))
    expect(memory.context(11 * 60_000).kills).toBe(0)
  })

  it('forgets everything when reset', () => {
    const memory = new MatchMemory()
    play(memory, ['kill', 'death'])
    memory.rememberComment('x')
    memory.reset()
    expect(memory.context(0).kills).toBe(0)
    expect(memory.recentComments()).toEqual([])
  })
})
