import { describe, expect, it, vi } from 'vitest'
import { Commentator, type CommentaryOptions } from '../src/main/companion/commentator'
import { analysisGapMs, areaLookGapMs } from '../src/main/companion/director'
import {
  makeEvent,
  normalizeVisionReport,
  type GameEvent,
  type GameEventType,
  type VisionGame
} from '../src/main/companion/events'

const VALORANT = { id: 'v', name: 'VALORANT', competitive: true }
const MINECRAFT = { id: 'minecraft', name: 'Minecraft', competitive: false }

type Seen = { type: GameEventType } & Record<string, unknown>
type Extras = {
  in_fight?: boolean
  phase?: string
  own_score?: number
  enemy_score?: number
  // Seconds the look took to come back (4 unless a test says otherwise).
  latency?: number
}

const ALL_ON = {
  combat: true,
  skill: true,
  teamwork: true,
  objectives: true,
  match: true,
  world: true
}

// A distinct line for every reaction, so the repetition check doesn't get in the way.
const uniqueLine = (n: number): string =>
  Array.from({ length: 6 }, (_, i) => (((n + 3) * (i + 7) * 2654435761) >>> 0).toString(36)).join(
    ' '
  )

interface Harness {
  commentator: Commentator
  options: CommentaryOptions
  prompts: string[]
  delivered: string[]
  replies: (string | Error | Promise<string>)[]
  observe: (at: number, events?: Seen[], extras?: Extras, game?: VisionGame) => GameEvent[]
  play: (at: number, events?: Seen[], extras?: Extras, game?: VisionGame) => Promise<GameEvent[]>
  wait: (at: number) => Promise<void>
}

function harness(
  over: Partial<CommentaryOptions> = {},
  canSpeak: () => boolean = () => true
): Harness {
  let clock = 0
  let lines = 0
  const prompts: string[] = []
  const delivered: string[] = []
  const replies: (string | Error | Promise<string>)[] = []
  const options: CommentaryOptions = {
    frequency: 'normal',
    intensity: 'normal',
    humor: 'light',
    categories: ALL_ON,
    tactics: true,
    language: 'en',
    game: VALORANT,
    ...over
  }
  const commentator = new Commentator({
    now: () => clock,
    canSpeak,
    generate: async (prompt) => {
      prompts.push(prompt)
      const reply = replies.shift()
      if (reply instanceof Error) throw reply
      return reply ?? uniqueLine(++lines)
    },
    deliver: (text) => delivered.push(text)
  })

  const observe: Harness['observe'] = (at, events = [], extras = {}, game = options.game) => {
    const raw = {
      phase: 'playing',
      in_fight: false,
      own_score: -1,
      enemy_score: -1,
      description: 'd',
      events: events.map((e) => ({
        sure: true,
        importance: 8,
        detail: `${e.type} seen`,
        opponent: '',
        place: '',
        count: 1,
        ...e
      })),
      ...extras
    }
    // The model takes a few seconds to answer about a frame.
    clock = (at + (extras.latency ?? 4)) * 1000
    return commentator.observe(normalizeVisionReport(raw, at * 1000), game)
  }
  const play: Harness['play'] = async (at, events = [], extras = {}, game = options.game) => {
    const fresh = observe(at, events, extras, game)
    await commentator.speakIfDue(options)
    return fresh
  }
  const wait: Harness['wait'] = async (at) => {
    clock = at * 1000
    await commentator.speakIfDue(options)
  }
  return { commentator, options, prompts, delivered, replies, observe, play, wait }
}

describe('important events get a reaction', () => {
  it('reacts to a victory', async () => {
    const h = harness()
    await h.play(0, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(1)
    expect(h.prompts[0]).toContain('won the match')
  })

  it('acknowledges a single kill', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('makes no AI call when nothing happened', async () => {
    const h = harness()
    await h.play(0)
    await h.play(12)
    expect(h.prompts).toHaveLength(0)
  })

  it('speaks far more often than the old 90-second cooldown allowed', async () => {
    const h = harness()
    for (let t = 0; t < 300; t += 30) await h.play(t, [{ type: 'objective_won' }])
    expect(h.delivered.length).toBeGreaterThan(300 / 90 + 1)
  })
})

describe('minor events do not cause excess', () => {
  it('does not comment on every kill in a long fight', async () => {
    const h = harness()
    const kills = 25
    for (let i = 0; i < kills; i++) await h.play(i * 12, [{ type: 'kill', opponent: `P${i}` }])
    expect(h.delivered.length).toBeGreaterThan(1)
    expect(h.delivered.length).toBeLessThan(kills / 2)
  })

  it('stays within the talking budget however busy the match is', async () => {
    const h = harness()
    for (let i = 0; i < 25; i++) await h.play(i * 12, [{ type: 'objective_won' }])
    expect(h.delivered.length).toBeLessThanOrEqual(10)
  })

  it('ignores small things on the Rare setting', async () => {
    const h = harness({ frequency: 'rare' })
    await h.play(0, [{ type: 'kill' }])
    expect(h.delivered).toHaveLength(0)
    await h.play(30, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('talks more as the frequency goes up', async () => {
    const script = async (frequency: CommentaryOptions['frequency']): Promise<number> => {
      const h = harness({ frequency })
      for (let i = 0; i < 40; i++) {
        await h.play(i * 12, [{ type: i % 5 === 0 ? 'round_won' : 'kill', opponent: `P${i}` }])
      }
      return h.delivered.length
    }
    const [rare, normal, frequent] = [
      await script('rare'),
      await script('normal'),
      await script('frequent')
    ]
    expect(rare).toBeLessThan(normal)
    expect(normal).toBeLessThan(frequent)
  })

  it('drops trivial world events by importance, like before', async () => {
    const h = harness({ game: MINECRAFT })
    await h.play(0, [{ type: 'other', importance: 3 }])
    expect(h.delivered).toHaveLength(0)
  })
})

describe('grouping events that happen close together', () => {
  it('makes one comment about a burst of kills', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill', opponent: 'Sova' }], { in_fight: true })
    await h.play(10, [{ type: 'kill', opponent: 'Jett' }], { in_fight: true })
    await h.play(18, [], { in_fight: false })
    expect(h.delivered).toHaveLength(1)
    expect(h.prompts[0]).toContain('Sova')
    expect(h.prompts[0]).toContain('Jett')
    expect(h.prompts[0]).toMatch(/as one moment/)
  })

  it('combines several events seen in the same frame', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill' }, { type: 'objective_won' }])
    expect(h.delivered).toHaveLength(1)
    expect(h.prompts).toHaveLength(1)
  })

  it('folds what happened during a cooldown into the next comment', async () => {
    const h = harness()
    await h.play(0, [{ type: 'objective_won' }])
    await h.play(12, [{ type: 'kill', opponent: 'Sova' }])
    await h.play(20, [{ type: 'team_wipe' }])
    await h.wait(30)
    expect(h.delivered).toHaveLength(2)
    expect(h.prompts[1]).toContain('Sova')
  })
})

describe('intense moments', () => {
  it('waits for a fight to calm down', async () => {
    const h = harness()
    await h.play(0, [{ type: 'objective_won' }], { in_fight: true })
    expect(h.delivered).toHaveLength(0)
    await h.play(8, [], { in_fight: false })
    expect(h.delivered).toHaveLength(1)
  })

  it('does not wait forever', async () => {
    const h = harness()
    await h.play(0, [{ type: 'objective_won' }], { in_fight: true })
    await h.wait(17)
    expect(h.delivered).toHaveLength(1)
  })

  it('still warns about something urgent', async () => {
    const h = harness({ game: MINECRAFT })
    await h.play(0, [{ type: 'low_health', importance: 9 }], { in_fight: true })
    expect(h.delivered).toHaveLength(1)
  })

  it('does not hold back an exceptional moment', async () => {
    const h = harness()
    await h.play(0, [{ type: 'clutch' }], { in_fight: true })
    expect(h.delivered).toHaveLength(1)
  })
})

describe('relevance', () => {
  it('respects categories that are switched off', async () => {
    const h = harness({ categories: { ...ALL_ON, combat: false } })
    await h.play(0, [{ type: 'kill' }])
    expect(h.delivered).toHaveLength(0)
    await h.play(30, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('does not react to something that is too old', async () => {
    const h = harness()
    h.observe(0, [{ type: 'kill' }])
    await h.wait(40)
    expect(h.prompts).toHaveLength(0)
  })

  it('still remembers a late event it is too late to react to', async () => {
    const h = harness()
    await h.play(100, [])
    await h.play(40, [{ type: 'kill', opponent: 'Sova' }], { latency: 64 })
    expect(h.delivered).toHaveLength(0)
    expect(h.commentator.context().kills).toBe(1)
  })

  it('handles an earlier frame arriving after a later one', async () => {
    const h = harness()
    h.observe(12, [{ type: 'kill', opponent: 'B' }])
    h.observe(10, [{ type: 'kill', opponent: 'A' }])
    await h.wait(18)
    expect(h.delivered).toHaveLength(1)
    const [a, b] = [h.prompts[0].indexOf('"A"'), h.prompts[0].indexOf('"B"')]
    expect(a).toBeGreaterThan(-1)
    expect(a).toBeLessThan(b)
  })
})

describe('repetition', () => {
  it('counts a victory screen that stays up once', async () => {
    const h = harness()
    await h.play(0, [{ type: 'victory' }])
    await h.play(15, [{ type: 'victory' }])
    await h.play(30, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('counts a death screen that stays up once, even after a long look', async () => {
    const h = harness({ game: MINECRAFT })
    expect(await h.play(0, [{ type: 'death' }])).toHaveLength(1)
    expect(await h.play(30, [{ type: 'death' }])).toHaveLength(0)
    expect(await h.play(90, [{ type: 'death' }])).toHaveLength(0)
    expect(h.delivered).toHaveLength(1)
  })

  it('counts a new death after play went on', async () => {
    const h = harness({ game: MINECRAFT })
    await h.play(0, [{ type: 'death' }])
    await h.play(30, [])
    expect(await h.play(60, [{ type: 'death' }])).toHaveLength(1)
  })

  it('does not count the same named kill twice while it is on screen', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill', opponent: 'Sova' }])
    expect(await h.play(12, [{ type: 'kill', opponent: 'SOVA' }])).toHaveLength(0)
    expect(h.commentator.context().kills).toBe(1)
  })

  it('counts nameless kills in different frames', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill' }])
    await h.play(12, [{ type: 'kill' }])
    expect(h.commentator.context().kills).toBe(2)
  })

  it('does not count a banner again after the score already showed that round', async () => {
    const h = harness()
    await h.play(0, [], { own_score: 2, enemy_score: 2 })
    await h.play(30, [], { own_score: 3, enemy_score: 2 })
    expect(await h.play(42, [{ type: 'round_won' }])).toHaveLength(0)
    expect(h.commentator.context().roundRun).toBe(1)
  })

  it('tells the AI what it said lately', async () => {
    const h = harness()
    h.replies.push('Beautifully done out there')
    await h.play(0, [{ type: 'victory' }])
    await h.play(60, [{ type: 'objective_won' }])
    expect(h.prompts[1]).toContain('Beautifully done out there')
  })

  it('asks once more when a big reaction repeats itself', async () => {
    const h = harness()
    h.replies.push(
      'Beautifully done out there',
      'Beautifully done out there',
      'Now that was clever'
    )
    await h.play(0, [{ type: 'objective_won' }])
    await h.play(60, [{ type: 'objective_won' }])
    expect(h.delivered).toEqual(['Beautifully done out there', 'Now that was clever'])
    expect(h.prompts).toHaveLength(3)
  })

  it('stays silent instead of repeating a small reaction', async () => {
    const h = harness()
    h.replies.push('Beautifully done out there', 'Beautifully done out there')
    await h.play(0, [{ type: 'assist' }])
    await h.play(60, [{ type: 'assist' }])
    expect(h.delivered).toHaveLength(1)
    expect(h.prompts).toHaveLength(2)
  })

  it('stays silent rather than claim something it did not see', async () => {
    const h = harness()
    h.replies.push('What a comeback that was')
    await h.play(0, [{ type: 'assist' }])
    expect(h.delivered).toHaveLength(0)
  })

  it('stays silent if the second try repeats too', async () => {
    const h = harness()
    h.replies.push(
      'Beautifully done out there',
      'Beautifully done out there',
      'Beautifully done out there'
    )
    await h.play(0, [{ type: 'objective_won' }])
    await h.play(60, [{ type: 'objective_won' }])
    expect(h.delivered).toHaveLength(1)
    expect(h.prompts).toHaveLength(3)
  })
})

describe('cooldowns and priorities', () => {
  it('holds a minor event back after a recent comment', async () => {
    const h = harness()
    await h.play(0, [{ type: 'objective_won' }])
    await h.play(20, [{ type: 'assist' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('lets an exceptional moment through a cooldown', async () => {
    const h = harness()
    await h.play(0, [{ type: 'objective_won' }])
    await h.play(11, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(2)
  })

  it('never talks over its own last comment', async () => {
    const h = harness()
    await h.play(0, [{ type: 'clutch' }])
    await h.play(1, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('reacts at the size of the biggest event in the group', async () => {
    const h = harness()
    await h.play(0, [{ type: 'assist' }, { type: 'victory' }])
    expect(h.prompts[0]).toContain('exceptional')
  })

  it('keeps the same kind of event from coming back too soon', async () => {
    const h = harness({ game: MINECRAFT })
    await h.play(0, [{ type: 'hostile_mob', importance: 9 }])
    await h.play(60, [{ type: 'hostile_mob', importance: 9 }])
    expect(h.delivered).toHaveLength(1)
    await h.play(200, [{ type: 'hostile_mob', importance: 9 }])
    expect(h.delivered).toHaveLength(2)
  })

  it('lets a bigger version of the same event through', async () => {
    const h = harness()
    await h.play(0, [{ type: 'multikill', count: 2 }])
    await h.play(26, [{ type: 'multikill', count: 5 }])
    expect(h.delivered).toHaveLength(2)
    expect(h.prompts[1]).toContain('exceptional')
  })
})

describe('the existing companion behaviour', () => {
  it('always has a word for dying outside competitive games', async () => {
    const h = harness({ game: MINECRAFT })
    await h.play(0, [{ type: 'low_health', importance: 9 }])
    await h.play(10, [{ type: 'death', importance: 10 }])
    expect(h.delivered).toHaveLength(2)
  })

  it('warns about danger in Minecraft', async () => {
    const h = harness({ game: MINECRAFT })
    await h.play(0, [{ type: 'hostile_mob', importance: 9, detail: 'A creeper is close.' }])
    expect(h.delivered).toHaveLength(1)
    expect(h.prompts[0]).toContain('A creeper is close.')
  })

  it('says nothing when it may not speak', async () => {
    const h = harness({}, () => false)
    await h.play(0, [{ type: 'victory' }])
    expect(h.prompts).toHaveLength(0)
    expect(h.delivered).toHaveLength(0)
  })
})

describe('personality settings', () => {
  it('reach the prompt', async () => {
    const h = harness({ intensity: 'subtle', humor: 'none', language: 'de' })
    await h.play(0, [{ type: 'victory' }])
    expect(h.prompts[0]).toMatch(/understated/)
    expect(h.prompts[0]).toMatch(/Do not joke/)
    expect(h.prompts[0]).toContain('in German')
  })
})

describe('bad moments', () => {
  it('reacts honestly, without flattering or blaming', async () => {
    const h = harness()
    await h.play(0, [{ type: 'death' }])
    expect(h.prompts[0]).toMatch(/do not praise/i)
    expect(h.prompts[0]).toMatch(/never blame/i)
  })

  it('does not pile on after every death', async () => {
    const h = harness()
    await h.play(0, [{ type: 'death' }])
    await h.play(50, [{ type: 'death' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('stays quiet about small setbacks in a hard match', async () => {
    const h = harness()
    for (let i = 0; i < 4; i++) await h.play(i * 200, [{ type: 'death' }])
    const before = h.delivered.length
    await h.play(1000, [{ type: 'death' }])
    expect(h.commentator.context().form).toBe('hard')
    expect(h.delivered.length).toBe(before)
  })

  it('brings up a repeat opponent as a bigger moment', async () => {
    const h = harness()
    await h.play(0, [{ type: 'death', opponent: 'Reyna' }])
    await h.play(50, [])
    await h.play(100, [{ type: 'death', opponent: 'Reyna' }])
    expect(h.delivered).toHaveLength(2)
    expect(h.prompts[1]).toMatch(/"Reyna" has now eliminated them 2 times/)
  })

  it('has a word after a defeat', async () => {
    const h = harness()
    await h.play(0, [{ type: 'defeat' }])
    expect(h.delivered).toHaveLength(1)
  })
})

describe('constructive observations', () => {
  const twoDeathsAt = async (h: Harness): Promise<void> => {
    await h.play(0, [{ type: 'death', place: 'A Main' }])
    await h.play(50, [])
    await h.play(100, [{ type: 'death', place: 'A Main' }])
  }

  it('wait for a break in competitive games', async () => {
    const h = harness()
    await twoDeathsAt(h)
    expect(h.prompts.at(-1)).toMatch(/Do not give advice/)
    await h.play(200, [{ type: 'round_lost' }], { phase: 'intermission' })
    expect(h.prompts.at(-1)).toMatch(/constructive/)
    expect(h.prompts.at(-1)).toContain('A Main')
  })

  it('get room to be said, even on a small moment', async () => {
    const h = harness()
    await twoDeathsAt(h)
    await h.play(200, [{ type: 'round_lost' }], { phase: 'intermission' })
    expect(h.prompts.at(-1)).toMatch(/at most 14 words/)
  })

  it('can be switched off', async () => {
    const h = harness({ tactics: false })
    await twoDeathsAt(h)
    await h.play(200, [{ type: 'round_lost' }], { phase: 'intermission' })
    expect(h.prompts.at(-1)).toMatch(/Do not give advice/)
  })

  it('stay occasional', async () => {
    const h = harness()
    await twoDeathsAt(h)
    await h.play(200, [{ type: 'round_lost' }], { phase: 'intermission' })
    await h.play(250, [])
    await h.play(300, [{ type: 'round_lost' }], { phase: 'intermission' })
    expect(h.prompts.at(-1)).toMatch(/Do not give advice/)
  })

  it('do not spoil a good moment', async () => {
    const h = harness()
    await twoDeathsAt(h)
    await h.play(200, [{ type: 'round_won' }], { phase: 'intermission' })
    expect(h.prompts.at(-1)).toMatch(/Do not give advice/)
  })

  it('can come mid-play outside competitive games once things calm down', async () => {
    const h = harness({ game: { id: 'h', name: 'Hades', competitive: false } })
    await twoDeathsAt(h)
    expect(h.prompts.at(-1)).toMatch(/constructive/)
  })
})

describe('match memory feeding the comments', () => {
  it('carries a streak into a later reaction, as a lower bound', async () => {
    const h = harness()
    for (let i = 0; i < 3; i++) await h.play(i * 12, [{ type: 'kill', opponent: `P${i}` }])
    await h.wait(40)
    expect(h.prompts.at(-1)).toMatch(/At least 3 eliminations/)
  })

  it('recognises a comeback from the score', async () => {
    const h = harness()
    const scores = [
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4]
    ]
    for (const [i, [own, enemy]] of scores.entries()) {
      await h.play(i * 120, [], { own_score: own, enemy_score: enemy })
    }
    expect(h.prompts.at(-1)).toMatch(/clearly behind/)
    expect(h.prompts.at(-1)).toMatch(/1-4/)
  })

  it('starts over for another game', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill' }])
    await h.play(30, [], {}, MINECRAFT)
    expect(h.commentator.context().kills).toBe(0)
  })
})

describe('never overlapping and never blocking', () => {
  it('writes one comment at a time', async () => {
    const h = harness()
    let finish: (text: string) => void = () => {}
    h.replies.push(new Promise<string>((resolve) => (finish = resolve)))
    h.observe(0, [{ type: 'victory' }])
    const first = h.commentator.speakIfDue(h.options)
    const second = h.commentator.speakIfDue(h.options)
    h.observe(12, [{ type: 'clutch' }])
    const third = h.commentator.speakIfDue(h.options)
    finish('What a finish')
    await Promise.all([first, second, third])
    expect(h.prompts).toHaveLength(1)
    expect(h.delivered).toEqual(['What a finish'])
  })

  it('stays silent when the AI fails, and works again afterwards', async () => {
    const h = harness()
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    h.replies.push(new Error('engine stopped'))
    await h.play(0, [{ type: 'objective_won' }])
    expect(h.delivered).toHaveLength(0)
    await h.play(12, [{ type: 'bomb_defused' }])
    expect(h.delivered).toHaveLength(1)
  })

  it('stays silent when the AI returns nothing usable', async () => {
    const h = harness()
    h.replies.push('{"comment": "x"}')
    await h.play(0, [{ type: 'victory' }])
    expect(h.delivered).toHaveLength(0)
  })

  it('drops a comment still being written when watching stops', async () => {
    const h = harness()
    let finish: (text: string) => void = () => {}
    h.replies.push(new Promise<string>((resolve) => (finish = resolve)))
    h.observe(0, [{ type: 'victory' }])
    const speaking = h.commentator.speakIfDue(h.options)
    h.commentator.reset()
    finish('Too late')
    await speaking
    expect(h.delivered).toHaveLength(0)
  })

  it('does not deliver if speaking stopped being allowed while writing', async () => {
    let allowed = true
    const h = harness({}, () => allowed)
    let finish: (text: string) => void = () => {}
    h.replies.push(new Promise<string>((resolve) => (finish = resolve)))
    h.observe(0, [{ type: 'victory' }])
    const speaking = h.commentator.speakIfDue(h.options)
    allowed = false
    finish('Too late')
    await speaking
    expect(h.delivered).toHaveLength(0)
  })

  it('forgets the match when reset', async () => {
    const h = harness()
    await h.play(0, [{ type: 'kill' }])
    h.commentator.reset()
    expect(h.commentator.context().kills).toBe(0)
  })
})

describe('how often the screen is read', () => {
  it('keeps today’s pace by default and looks more often when asked', () => {
    expect(analysisGapMs('normal', false, 0)).toBe(12_000)
    expect(analysisGapMs('rare', false, 0)).toBe(12_000)
    expect(analysisGapMs('frequent', false, 0)).toBe(8_000)
  })

  it('looks at the feed often enough to catch a line before it fades', () => {
    expect(areaLookGapMs('normal', 0)).toBe(3_000)
    expect(areaLookGapMs('frequent', 0)).toBe(3_000)
  })

  it('looks at the feed less on the Rare setting', () => {
    expect(areaLookGapMs('rare', 0)).toBe(6_000)
  })

  it('still leaves the GPU to the game when looking at the feed', () => {
    expect(areaLookGapMs('normal', 2_000)).toBe(6_000)
    expect(areaLookGapMs('frequent', 600_000)).toBe(60_000)
  })

  it('looks a little more often during a fight', () => {
    expect(analysisGapMs('normal', true, 0)).toBe(8_000)
  })

  it('backs off when the model is slow, to leave the GPU to the game', () => {
    expect(analysisGapMs('normal', true, 6_000)).toBe(18_000)
    expect(analysisGapMs('frequent', false, 600_000)).toBe(60_000)
  })
})

describe('a single-player session seen through the screen', () => {
  const SILKSONG = { id: 'silksong', name: 'Hollow Knight: Silksong', competitive: false }
  const screenEvents = (
    h: Harness,
    at: number,
    types: GameEventType[],
    fields: { opponent?: string; place?: string } = {}
  ): GameEvent[] =>
    h.commentator.observe(
      {
        time: at * 1000,
        source: 'screen',
        phase: 'playing',
        inFight: false,
        score: null,
        description: '',
        events: types.map((type) => makeEvent(type, at * 1000, 'screen', fields))
      },
      SILKSONG
    )

  it('tells the model which attempt this is', async () => {
    const h = harness({ game: SILKSONG })
    screenEvents(h, 0, ['boss_encounter'], { opponent: 'Moss Mother' })
    await h.wait(4)
    expect(h.prompts[0]).toContain('attempt 1')
  })

  it('sizes beating a boss as exceptional after three attempts', () => {
    const h = harness({ game: SILKSONG })
    for (let i = 0; i < 3; i++) {
      screenEvents(h, i * 100, ['boss_encounter'], { opponent: 'Moss Mother' })
    }
    const won = screenEvents(h, 400, ['fight_won'], { opponent: 'Moss Mother' })
    expect(won[0].tier).toBe('exceptional')
  })

  it('sizes a death as minor early in a boss fight and significant from the third attempt', () => {
    const h = harness({ game: SILKSONG })
    screenEvents(h, 0, ['boss_encounter'], { opponent: 'Moss Mother' })
    expect(screenEvents(h, 10, ['death'], { place: 'Grotto' })[0].tier).toBe('minor')
    screenEvents(h, 100, ['boss_encounter'], { opponent: 'Moss Mother' })
    screenEvents(h, 200, ['boss_encounter'], { opponent: 'Moss Mother' })
    expect(screenEvents(h, 210, ['death'], { place: 'Grotto' })[0].tier).toBe('significant')
  })

  it('counts a boss title seen again ten seconds later as a new attempt', () => {
    const h = harness({ game: SILKSONG })
    expect(screenEvents(h, 0, ['boss_encounter'], { opponent: 'Moss Mother' })).toHaveLength(1)
    expect(screenEvents(h, 5, ['boss_encounter'], { opponent: 'Moss Mother' })).toHaveLength(0)
    expect(screenEvents(h, 15, ['boss_encounter'], { opponent: 'Moss Mother' })).toHaveLength(1)
  })

  it('counts the same area entered twice within two minutes once', () => {
    const h = harness({ game: SILKSONG })
    expect(screenEvents(h, 0, ['area_entered'], { place: 'Moss Grotto' })).toHaveLength(1)
    expect(screenEvents(h, 60, ['area_entered'], { place: 'Moss Grotto' })).toHaveLength(0)
  })

  it('counts a different area entered within two minutes as a new area', () => {
    const h = harness({ game: SILKSONG })
    expect(screenEvents(h, 0, ['area_entered'], { place: 'Moss Grotto' })).toHaveLength(1)
    expect(screenEvents(h, 60, ['area_entered'], { place: 'The Marrow' })).toHaveLength(1)
  })

  it('does not blame the old boss for a death in the next area', async () => {
    const h = harness({ game: SILKSONG })
    screenEvents(h, 0, ['area_entered'], { place: 'Moss Grotto' })
    for (let i = 0; i < 3; i++) {
      screenEvents(h, 5 + i * 40, ['boss_encounter'], { opponent: 'Moss Mother' })
    }
    screenEvents(h, 100, ['area_entered'], { place: 'The Marrow' })
    const died = screenEvents(h, 110, ['death'], { place: 'The Marrow' })
    expect(died[0].tier).toBe('minor')
    await h.wait(114)
    expect(h.prompts.at(-1)).toContain('died in The Marrow')
    expect(h.prompts.at(-1)).not.toContain('died to Moss Mother')
  })

  it('forgets the session when the game changes', async () => {
    const h = harness({ game: SILKSONG })
    screenEvents(h, 0, ['boss_encounter'], { opponent: 'Moss Mother' })
    h.commentator.observe(
      {
        time: 500_000,
        source: 'screen',
        phase: 'playing',
        inFight: false,
        score: null,
        description: '',
        events: []
      },
      { id: 'other', name: 'Other', competitive: false }
    )
    screenEvents(h, 600, ['boss_encounter'], { opponent: 'Moss Mother' })
    await h.wait(604)
    expect(h.prompts[0]).toContain('attempt 1')
  })
})
