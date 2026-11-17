import { describe, expect, it } from 'vitest'
import { makeEvent, type GameEvent, type GameEventType } from '../src/main/companion/events'
import { SessionMemory } from '../src/main/companion/sessionMemory'

const screen = (
  type: GameEventType,
  time: number,
  fields: { opponent?: string; place?: string } = {}
): ReturnType<typeof makeEvent> => makeEvent(type, time * 1000, 'screen', fields)

const boss = (time: number, name = 'Moss Mother'): ReturnType<typeof makeEvent> =>
  screen('boss_encounter', time, { opponent: name })

describe('session memory', () => {
  it('counts how many attempts the player has made at a boss', () => {
    const memory = new SessionMemory()
    for (let i = 0; i < 3; i++) memory.absorb([boss(i * 100)], i * 100_000)
    expect(memory.context(400_000).boss).toEqual({ name: 'Moss Mother', attempt: 3 })
  })

  it('announces a milestone once, at attempt 5', () => {
    const memory = new SessionMemory()
    const derived: GameEvent[] = []
    for (let i = 0; i < 7; i++) derived.push(...memory.absorb([boss(i * 100)], i * 100_000))
    const milestones = derived.filter((e) => e.type === 'milestone')
    expect(milestones).toHaveLength(1)
    expect(milestones[0].detail).toBe('attempt 5 at Moss Mother')
  })

  it('announces milestones at 10 and 20 as well', () => {
    const memory = new SessionMemory()
    const derived: GameEvent[] = []
    for (let i = 0; i < 20; i++) derived.push(...memory.absorb([boss(i * 100)], i * 100_000))
    expect(derived.map((e) => e.detail)).toEqual([
      'attempt 5 at Moss Mother',
      'attempt 10 at Moss Mother',
      'attempt 20 at Moss Mother'
    ])
  })

  it('counts deaths per area and starts again on entering another area', () => {
    const memory = new SessionMemory()
    memory.absorb([screen('area_entered', 0, { place: 'Moss Grotto' })], 0)
    memory.absorb([screen('death', 10, { place: 'Moss Grotto' })], 10_000)
    memory.absorb([screen('death', 50, { place: 'Moss Grotto' })], 50_000)
    expect(memory.context(60_000)).toMatchObject({ area: 'Moss Grotto', deathsHere: 2 })
    memory.absorb([screen('area_entered', 100, { place: 'The Marrow' })], 100_000)
    expect(memory.context(110_000)).toMatchObject({ area: 'The Marrow', deathsHere: 0 })
    memory.absorb([screen('area_entered', 200, { place: 'Moss Grotto' })], 200_000)
    expect(memory.context(210_000).deathsHere).toBe(2)
  })

  it('counts close calls and visited areas', () => {
    const memory = new SessionMemory()
    memory.absorb([screen('area_entered', 0, { place: 'A' })], 0)
    memory.absorb([screen('area_entered', 10, { place: 'B' })], 10_000)
    memory.absorb([screen('low_health', 20)], 20_000)
    memory.absorb([screen('low_health', 30)], 30_000)
    expect(memory.context(40_000)).toMatchObject({ closeCalls: 2, areasVisited: 2 })
  })

  it('fills in the attempt count when the boss is beaten', () => {
    const memory = new SessionMemory()
    for (let i = 0; i < 3; i++) memory.absorb([boss(i * 100)], i * 100_000)
    const won = screen('fight_won', 400)
    memory.absorb([won], 400_000)
    expect(won.detail).toContain('attempt 3')
    expect(won.detail).toContain('Moss Mother')
    expect(won.count).toBe(3)
  })

  it('words a boss win as likely, since it is worked out rather than seen', () => {
    const memory = new SessionMemory()
    memory.absorb([boss(0)], 0)
    const won = screen('fight_won', 30, { opponent: 'Moss Mother' })
    memory.absorb([won], 30_000)
    expect(won.detail).toBe('left the arena of Moss Mother alive on attempt 1, likely beaten')
    expect(memory.context(31_000).timeline.at(-1)).toBe('likely beat Moss Mother')
  })

  it('keeps the timeline to ten entries, newest last', () => {
    const memory = new SessionMemory()
    for (let i = 0; i < 15; i++) {
      memory.absorb([screen('area_entered', i, { place: `Area ${i}` })], i * 1000)
    }
    const { timeline } = memory.context(20_000)
    expect(timeline).toHaveLength(10)
    expect(timeline[0]).toBe('entered Area 5')
    expect(timeline[9]).toBe('entered Area 14')
  })

  it('words timeline entries as short facts', () => {
    const memory = new SessionMemory()
    memory.absorb([screen('area_entered', 0, { place: 'Moss Grotto' })], 0)
    for (let i = 1; i <= 3; i++) memory.absorb([boss(i)], i * 1000)
    memory.absorb([screen('death', 5, { place: 'Moss Grotto' })], 5000)
    expect(memory.context(6000).timeline).toEqual([
      'entered Moss Grotto',
      'attempt 1 at Moss Mother',
      'attempt 2 at Moss Mother',
      'attempt 3 at Moss Mother',
      'died to Moss Mother'
    ])
  })

  it('stays small however many events come in', () => {
    const memory = new SessionMemory()
    for (let i = 0; i < 1000; i++) {
      memory.absorb([boss(i, `Boss ${i}`)], i)
      memory.absorb([screen('area_entered', i, { place: `Area ${i}` })], i)
      memory.absorb([screen('death', i, { place: `Area ${i}` })], i)
    }
    expect(memory.size().bosses).toBeLessThanOrEqual(20)
    expect(memory.size().areas).toBeLessThanOrEqual(40)
    expect(memory.context(0).timeline.length).toBeLessThanOrEqual(10)
  })

  it('forgets everything on reset', () => {
    const memory = new SessionMemory()
    memory.absorb([boss(0), screen('area_entered', 0, { place: 'A' })], 0)
    memory.reset()
    expect(memory.context(0)).toEqual({
      boss: null,
      deathsHere: 0,
      area: null,
      closeCalls: 0,
      areasVisited: 0,
      timeline: []
    })
  })
})
