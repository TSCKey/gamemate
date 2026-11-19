// VALORANT's round moments the player asked for after a play test: being the last one alive on
// the team, winning the round that way (a clutch) or being eliminated that way, and two or more
// kills in quick succession ("double kill").
import { describe, expect, it } from 'vitest'
import {
  makeEvent,
  type FrameReport,
  type GameEvent,
  type GameEventType
} from '../src/main/companion/events'
import { LastAliveWatch } from '../src/main/companion/lastAlive'
import { MatchMemory } from '../src/main/companion/matchMemory'
import { Commentator } from '../src/main/companion/commentator'
import { readsTeamBar } from '../src/main/companion/hudAreas'
import { teamBarBox, teammatesAlive, type BgraImage } from '../src/main/geis/adapters/teamBar'

const seen = (type: GameEventType, time: number, fields: Partial<GameEvent> = {}): GameEvent =>
  makeEvent(type, time, 'vision', fields)

// The top bar at 1080p as the count reads it: a health bar under each living teammate's
// portrait, nearest the timer first, over a scene of one colour.
function topBar(
  alive: number,
  options: { hurt?: boolean; flash?: boolean; scene?: number[] } = {}
): BgraImage {
  const box = teamBarBox({ x: 0, y: 0, width: 1920, height: 1080 })
  const data = new Uint8Array(box.width * box.height * 4)
  const paint = (x: number, y: number, [r, g, b]: number[]): void => {
    const i = (y * box.width + x) * 4
    data.set([b, g, r, 255], i)
  }
  for (let y = 0; y < box.height; y++)
    for (let x = 0; x < box.width; x++)
      paint(x, y, options.flash ? [250, 250, 250] : (options.scene ?? [60, 70, 50]))
  for (let slot = 0; slot < alive; slot++) {
    const centre = 960 - 230.5 - 65.5 * slot - box.x
    for (let y = 77 - box.y; y < 82 - box.y; y++) {
      for (let x = Math.round(centre - 21); x < Math.round(centre + 21); x++) {
        const lost = options.hurt && x > centre - 10
        paint(x, y, lost ? [150, 150, 150] : [245, 245, 245])
      }
    }
  }
  return { width: box.width, height: box.height, data }
}

describe('counting the team in VALORANT’s top bar', () => {
  it('counts a health bar under each living teammate', () => {
    for (const alive of [1, 2, 3, 4, 5]) expect(teammatesAlive(topBar(alive))).toBe(alive)
  })

  it('counts a hurt teammate, whose bar is mostly grey', () => {
    expect(teammatesAlive(topBar(3, { hurt: true }))).toBe(3)
  })

  it('takes no salmon or light grey wall behind an empty slot for a bar', () => {
    expect(teammatesAlive(topBar(3, { scene: [220, 140, 120] }))).toBe(3)
    expect(teammatesAlive(topBar(2, { scene: [170, 170, 170] }))).toBe(2)
  })

  it('reads nothing during a flash or with no bars, rather than a wrong count', () => {
    expect(teammatesAlive(topBar(4, { flash: true }))).toBeNull()
    expect(teammatesAlive(topBar(0))).toBeNull()
  })

  it('finds the bar for the game window wherever it is, and scales it with the game', () => {
    expect(teamBarBox({ x: 0, y: 0, width: 1920, height: 1080 })).toEqual({
      x: 447,
      y: 70,
      width: 304,
      height: 20
    })
    const small = teamBarBox({ x: 100, y: 50, width: 1280, height: 720 })
    expect(small.x).toBe(Math.round(100 + 640 - 513.5 * (720 / 1080)))
    expect(small.y).toBe(Math.round(50 + 70 * (720 / 1080)))
  })

  it('is read only in VALORANT', () => {
    expect(readsTeamBar('VALORANT')).toBe(true)
    expect(readsTeamBar('Overwatch 2')).toBe(false)
  })
})

describe('the last one alive', () => {
  // One look every 3 s with the count read then; events on the looks given.
  function play(
    watch: LastAliveWatch,
    counts: (number | null)[],
    events: Record<number, GameEvent[]> = {}
  ): GameEvent[] {
    return counts.flatMap((count, i) => watch.absorb(i * 3000, count, events[i] ?? []))
  }

  it('notices the player alone once two looks agree', () => {
    const out = play(new LastAliveWatch(), [5, 5, 3, 3, 2, 1, 1, 1])
    expect(out.map((e) => [e.type, e.time])).toEqual([['last_alive', 18_000]])
  })

  it('takes no single odd reading for a count', () => {
    expect(play(new LastAliveWatch(), [5, 5, 4, 1, 4, 4, 3, 3])).toEqual([])
  })

  it('says nothing when the player died first and a teammate is the last one', () => {
    const death = seen('death', 6000, { opponent: 'Jett' })
    expect(play(new LastAliveWatch(), [5, 5, 4, 4, 1, 1], { 2: [death] })).toEqual([])
  })

  it('calls a round won while alone a clutch', () => {
    const won = seen('round_won', 24_000)
    const out = play(new LastAliveWatch(), [5, 5, 2, 1, 1, 1, 1, 1, 1], { 8: [won] })
    expect(out.map((e) => e.type)).toEqual(['last_alive', 'clutch'])
    expect(out[1].related).toEqual([out[0].id, won.id])
  })

  it('tells a clutch lost when the player falls alone, speaking for that death', () => {
    const death = seen('death', 18_000, { opponent: 'Reyna' })
    const out = play(new LastAliveWatch(), [4, 4, 1, 1, 1, 1, 1], { 6: [death] })
    expect(out.map((e) => e.type)).toEqual(['last_alive', 'clutch_lost'])
    expect(out[1].opponent).toBe('Reyna')
    expect(out[1].related).toContain(death.id)
  })

  it('starts over each round: the team coming back, or a while after the round result', () => {
    const watch = new LastAliveWatch()
    const lost = seen('round_lost', 12_000)
    const firstRound = play(watch, [3, 3, 1, 1, 1], { 4: [lost] })
    expect(firstRound.map((e) => e.type)).toEqual(['last_alive'])
    // Next round, the whole team is back and it happens again.
    const next = [5, 5, 5, 2, 2, 1, 1].flatMap((count, i) =>
      watch.absorb(60_000 + i * 3000, count, [])
    )
    expect(next.map((e) => e.type)).toEqual(['last_alive'])
  })

  it('never calls the count still showing after a round the moment again', () => {
    const watch = new LastAliveWatch()
    const won = seen('round_won', 9000)
    play(watch, [3, 3, 1, 1], { 3: [won] })
    const later = [1, 1, 1, 1].flatMap((count, i) => watch.absorb(30_000 + i * 3000, count, []))
    expect(later).toEqual([])
  })
})

describe('kills in quick succession', () => {
  const frame = (time: number, events: GameEvent[]): FrameReport => ({
    time,
    source: 'vision',
    phase: 'playing',
    inFight: false,
    score: null,
    description: '',
    events
  })

  it('makes a double kill of two kills a few seconds apart, and a triple of the next', () => {
    const memory = new MatchMemory()
    const a = seen('kill', 0, { opponent: 'Sage' })
    const b = seen('kill', 3000, { opponent: 'Omen' })
    expect(memory.absorb(frame(0, [a]))).toEqual([])
    const double = memory.absorb(frame(3000, [b]))
    expect(double.map((e) => [e.type, e.count])).toEqual([['multikill', 2]])
    expect(double[0].related).toEqual([a.id, b.id])
    const triple = memory.absorb(frame(9000, [seen('kill', 9000, { opponent: 'Jett' })]))
    expect(triple.filter((e) => e.type === 'multikill').map((e) => e.count)).toEqual([3])
  })

  it('counts two kills read on the same look', () => {
    const memory = new MatchMemory()
    const both = [seen('kill', 0, { opponent: 'Sage' }), seen('kill', 0, { opponent: 'Omen' })]
    expect(memory.absorb(frame(0, both)).map((e) => [e.type, e.count])).toEqual([['multikill', 2]])
  })

  it('makes none of kills far apart, or with a death between', () => {
    const memory = new MatchMemory()
    memory.absorb(frame(0, [seen('kill', 0, { opponent: 'Sage' })]))
    expect(memory.absorb(frame(15_000, [seen('kill', 15_000, { opponent: 'Omen' })]))).toEqual([])
    memory.absorb(frame(17_000, [seen('death', 17_000, { opponent: 'Jett' })]))
    expect(memory.absorb(frame(19_000, [seen('kill', 19_000, { opponent: 'Neon' })]))).toEqual([])
  })
})

describe('what the companion says about them', () => {
  const VALORANT = { id: 'v', name: 'VALORANT', competitive: true }
  const ALL_ON = {
    combat: true,
    skill: true,
    teamwork: true,
    objectives: true,
    match: true,
    world: true
  }
  function harness(): {
    observe: (at: number, events: GameEvent[]) => void
    speak: (at: number) => Promise<void>
    prompts: string[]
  } {
    let clock = 0
    let n = 0
    const prompts: string[] = []
    const commentator = new Commentator({
      now: () => clock,
      generate: async (prompt) => {
        prompts.push(prompt)
        n++
        return `Line ${'abcdefghij'[n]} number ${n * 7919} spoken ${n}`
      },
      deliver: () => {}
    })
    const options = {
      frequency: 'frequent' as const,
      intensity: 'normal' as const,
      humor: 'light' as const,
      categories: ALL_ON,
      tactics: false,
      language: 'en' as const,
      game: VALORANT
    }
    return {
      prompts,
      observe: (at, events) => {
        clock = at
        commentator.observe(
          {
            time: at,
            source: 'vision',
            phase: 'playing',
            inFight: false,
            score: null,
            description: '',
            events
          },
          VALORANT
        )
      },
      speak: async (at) => {
        clock = at
        await commentator.speakIfDue(options)
      }
    }
  }

  it('says "double kill" once instead of a word for each kill', async () => {
    const h = harness()
    const memory = new MatchMemory()
    const a = seen('kill', 1000, { opponent: 'Sage' })
    const b = seen('kill', 4000, { opponent: 'Omen' })
    h.observe(1000, [a])
    h.observe(4000, [b, ...memory.absorb(frame(1000, [a])), ...memory.absorb(frame(4000, [b]))])
    await h.speak(8000)
    expect(h.prompts).toHaveLength(1)
    expect(h.prompts[0]).toMatch(/several opponents in quick succession/)
    await h.speak(40_000)
    expect(h.prompts).toHaveLength(1)

    function frame(time: number, events: GameEvent[]): FrameReport {
      return {
        time,
        source: 'vision',
        phase: 'playing',
        inFight: false,
        score: null,
        description: '',
        events
      }
    }
  })

  it('speaks up for the last one alive, and again for the clutch', async () => {
    const h = harness()
    const watch = new LastAliveWatch()
    const look = (at: number, count: number, events: GameEvent[] = []): void =>
      h.observe(at, [...events, ...watch.absorb(at, count, events)])
    look(0, 3)
    look(3000, 3)
    look(6000, 1)
    look(9000, 1)
    await h.speak(12_500)
    expect(h.prompts).toHaveLength(1)
    expect(h.prompts[0]).toMatch(/last one alive/)
    look(21_000, 1, [seen('round_won', 21_000)])
    await h.speak(24_500)
    expect(h.prompts).toHaveLength(2)
    expect(h.prompts[1]).toMatch(/alone against the odds/)
  })

  it('speaks for a clutch lost instead of the plain death', async () => {
    const h = harness()
    const watch = new LastAliveWatch()
    const look = (at: number, count: number, events: GameEvent[] = []): void =>
      h.observe(at, [...events, ...watch.absorb(at, count, events)])
    look(0, 2)
    look(3000, 2)
    look(6000, 1)
    look(9000, 1)
    await h.speak(12_500)
    look(30_000, 1, [seen('death', 30_000, { opponent: 'Reyna' })])
    await h.speak(33_500)
    expect(h.prompts).toHaveLength(2)
    expect(h.prompts[1]).toMatch(/alone against the rest, and was eliminated/)
  })
})
