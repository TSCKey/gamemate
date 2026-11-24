// Rocket League read off the screen: the scoreboard's digits from their pixels, the game's popups
// and announcements as read by the text reader, and what they become through the same reader as
// the Stats API (rocketReading.ts), into the commentary pipeline.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/main/system/settings', () => ({ getSettings: () => ({}) }))
import { readScoreboard, type Scoreboard } from '../src/main/companion/rocketHud'
import { PLAYER, popupOf, RocketScreen, scoredBy } from '../src/main/companion/rocketScreen'
import { RocketWatch } from '../src/main/companion/rocketReading'
import { Commentator } from '../src/main/companion/commentator'
import type { GameEvent } from '../src/main/companion/events'
import type { BgraImage } from '../src/main/geis/adapters/teamBar'

// --- The scoreboard, drawn the way the game draws it: thin white segment digits, the player's
// team's score in a coloured box left of the clock and the other team's right of it.
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg'
}

class Canvas {
  readonly data: Uint8Array
  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.data = new Uint8Array(width * height * 4)
    this.fill(0, 0, width, height, [20, 15, 10])
  }
  fill(x: number, y: number, w: number, h: number, [b, g, r]: number[]): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        if (xx < 0 || yy < 0 || xx >= this.width || yy >= this.height) continue
        const i = (yy * this.width + xx) * 4
        this.data.set([b, g, r, 255], i)
      }
    }
  }
  // One digit, `w` wide and `h` tall, from its top left corner. The game's 1 is a narrow stroke
  // with a flag at the top.
  digit(ch: string, x: number, y: number, w: number, h: number, t: number): void {
    const white = [245, 245, 245]
    if (ch === '1') {
      this.fill(x + w * 0.35, y, t, h, white)
      this.fill(x + w * 0.15, y, w * 0.2 + t, t, white)
      return
    }
    const on = SEGMENTS[ch]
    if (on.includes('a')) this.fill(x, y, w, t, white)
    if (on.includes('d')) this.fill(x, y + h - t, w, t, white)
    if (on.includes('g')) this.fill(x, y + h / 2 - t / 2, w, t, white)
    if (on.includes('f')) this.fill(x, y, t, h / 2, white)
    if (on.includes('e')) this.fill(x, y + h / 2, t, h / 2, white)
    if (on.includes('b')) this.fill(x + w - t, y, t, h / 2, white)
    if (on.includes('c')) this.fill(x + w - t, y + h / 2, t, h / 2, white)
  }
  image(): BgraImage {
    return { width: this.width, height: this.height, data: this.data }
  }
}

// The strip the adapter grabs (0.36-0.64 of the width, the top 7.5%), at a game height.
function scoreboard(own: string, clock: string, other: string, gameHeight = 1080): BgraImage {
  const s = gameHeight / 1080
  const width = Math.round(((gameHeight * 16) / 9) * 0.28)
  const height = Math.round(gameHeight * 0.075)
  const c = new Canvas(width, height)
  const mid = width / 2
  const t = Math.max(2, Math.round(3 * s))
  // The boxes, orange and blue, with their white inner edges.
  c.fill(mid - 180 * s, 10 * s, 81 * s, 65 * s, [60, 130, 240])
  c.fill(mid + 99 * s, 10 * s, 81 * s, 65 * s, [240, 100, 40])
  c.fill(mid - 100 * s, 10 * s, t, 65 * s, [250, 250, 250])
  c.fill(mid + 99 * s, 10 * s, t, 65 * s, [250, 250, 250])
  const boxDigits = (text: string, centre: number): void => {
    const w = 30 * s
    const gap = 8 * s
    const total = text.length * w + (text.length - 1) * gap
    ;[...text].forEach((ch, i) =>
      c.digit(ch, centre - total / 2 + i * (w + gap), 25 * s, w, 42 * s, t)
    )
  }
  boxDigits(own, mid - 139 * s)
  boxDigits(other, mid + 139 * s)
  // The clock: digits 30 wide and 28 tall, a colon of two dots, a plus in overtime.
  const w = 30 * s
  const gap = 9 * s
  const parts = [...clock]
  const widthOf = (ch: string): number => (ch === ':' ? t : ch === '+' ? 14 * s : w)
  const total = parts.reduce((sum, ch) => sum + widthOf(ch) + gap, -gap)
  let x = mid - total / 2
  for (const ch of parts) {
    if (ch === ':') {
      c.fill(x, 34 * s, t, t, [250, 250, 250])
      c.fill(x, 48 * s, t, t, [250, 250, 250])
    } else if (ch === '+') {
      c.fill(x, 41 * s, 14 * s, t, [250, 250, 250])
      c.fill(x + 7 * s - t / 2, 35 * s, t, 14 * s, [250, 250, 250])
    } else {
      c.digit(ch, x, 27 * s, w, 28 * s, t)
    }
    x += widthOf(ch) + gap
  }
  return c.image()
}

describe('the scoreboard', () => {
  it('reads both scores and the clock, at 1080p and 720p', () => {
    for (const height of [1080, 720]) {
      expect(readScoreboard(scoreboard('3', '2:41', '1', height))).toEqual({
        own: 3,
        other: 1,
        seconds: 161,
        overtime: false
      })
      expect(readScoreboard(scoreboard('10', '0:07', '9', height))).toEqual({
        own: 10,
        other: 9,
        seconds: 7,
        overtime: false
      })
    }
  })

  it('reads every digit, and overtime from the plus', () => {
    for (const d of '0123456789') {
      expect(readScoreboard(scoreboard(d, `${d}:5${d}`, d)).own).toBe(Number(d))
      expect(readScoreboard(scoreboard(d, `${d}:5${d}`, d)).seconds).toBe(
        Number(d) * 60 + 50 + Number(d)
      )
    }
    expect(readScoreboard(scoreboard('2', '+1:05', '2'))).toEqual({
      own: 2,
      other: 2,
      seconds: 65,
      overtime: true
    })
  })

  it('says unknown, never a guess, when there is no scoreboard', () => {
    const blank = new Canvas(538, 81).image()
    expect(readScoreboard(blank)).toEqual({
      own: null,
      other: null,
      seconds: null,
      overtime: false
    })
  })
})

describe('the game’s popups and announcements', () => {
  it('knows the popups as the text reader reads them, a letter off included', () => {
    expect(popupOf('SHOT ON GOAL')).toBe('Shot')
    expect(popupOf('SHOTO GOAL')).toBe('Shot')
    expect(popupOf('CENTER BALL')).toBe('Center')
    expect(popupOf('EPIC SAVE')).toBe('EpicSave')
    expect(popupOf('AERIAL GOAL')).toBe('AerialGoal')
    expect(popupOf('HAT TRICK')).toBe('HatTrick')
    expect(popupOf('SWISH GOAL')).toBe('SwishGoal')
    expect(popupOf('GOAL')).toBe('Goal')
    // Short words must be exact, and the points under a popup are no popup.
    expect(popupOf('SAVES')).toBeNull()
    expect(popupOf('OAL')).toBeNull()
    expect(popupOf('+10')).toBeNull()
    expect(popupOf('Miet2pain')).toBeNull()
  })

  it('reads who the game says scored', () => {
    expect(scoredBy('LEQOOOO SCORED!')).toBe('LEQOOOO')
    expect(scoredBy('T_B_R- SCORED!')).toBe('T_B_R-')
    expect(scoredBy('[SIMP] T_B_R- SCORED')).toBe('T_B_R-')
    expect(scoredBy('SHOT ON GOAL')).toBeNull()
  })
})

// --- A match on screen, one look a second.
const board = (
  own: number | null,
  clock: number | null,
  other: number | null,
  overtime = false
): Scoreboard => ({
  own,
  other,
  seconds: clock,
  overtime
})

interface Look {
  board?: Scoreboard | null
  middle?: string[]
  replay?: string[]
}

class Match {
  readonly screen = new RocketScreen()
  readonly watch = new RocketWatch('screen', 0.9)
  readonly notes: string[] = []
  readonly events: GameEvent[] = []
  t = 0
  last: Scoreboard | null = null
  look(l: Look = {}): GameEvent[] {
    this.t += 1000
    const b = l.board === undefined ? this.last : l.board
    if (l.board !== undefined) this.last = l.board
    const reading = this.screen.look(
      { time: this.t, board: b, middle: l.middle ?? [], replay: l.replay ?? [] },
      [PLAYER, 'TSCKey']
    )
    this.notes.push(...reading.notes)
    const events: GameEvent[] = []
    for (const m of reading.messages) {
      events.push(...this.watch.absorb(m, m.At ?? this.t, [PLAYER]))
    }
    events.push(...this.watch.tick(this.t))
    this.events.push(...events)
    return events
  }
  // `n` looks with the clock running down from `from`.
  run(n: number, own: number, other: number, from: number): void {
    for (let i = 0; i < n; i++) this.look({ board: board(own, from - i, other) })
  }
}
const kinds = (events: GameEvent[]): string[] =>
  events.map((e) => `${e.type}${e.opponent ? `(${e.opponent})` : ''}`)

describe('a match read off the screen', () => {
  it('starts from the score it finds, without calling it a goal', () => {
    const m = new Match()
    m.run(5, 2, 1, 200)
    expect(m.events).toEqual([])
  })

  it('tells the player’s goal from their popups, with the mechanic the game named', () => {
    const m = new Match()
    m.run(3, 1, 1, 200)
    m.look({ middle: ['SHOT ON GOAL', '+10'] })
    m.look({ board: board(2, 196, 1), middle: ['GOAL', '+100', 'T_B_R- SCORED!'] })
    m.look({ middle: ['AERIAL GOAL', '+20'] })
    m.look({ replay: ['SCORED BY', '[SIMP] T_B_R-'] })
    m.look()
    m.look()
    m.look()
    expect(kinds(m.events)).toEqual(['goal_scored'])
    const goal = m.events[0]
    expect(goal).toMatchObject({ source: 'screen', basis: 'verified' })
    expect(goal.detail).toMatch(/puts the team ahead/)
    expect(goal.detail).toMatch(/the game named it an aerial goal/)
    expect(goal.detail).toMatch(/2-1 \(player's team first\)/)
  })

  it('tells a teammate’s goal by name, an assist, and a goal against', () => {
    const m = new Match()
    m.run(3, 0, 0, 250)
    m.look({ board: board(1, 246, 0), middle: ['LEQOOOO SCORED!'] })
    m.run(6, 1, 0, 245)
    m.look({ board: board(2, 240, 0), middle: ['ASSIST', '+50'] })
    m.look({ replay: ['SCORED BY', '[OMFG] Leqoooo'] })
    m.run(6, 2, 0, 238)
    m.look({ board: board(2, 233, 1), middle: ['RIVAL SCORED!'] })
    m.run(6, 2, 1, 232)
    expect(kinds(m.events)).toEqual([
      'teammate_goal(LEQOOOO)',
      'goal_assist(Leqoooo)',
      'goal_conceded(RIVAL)'
    ])
  })

  it('takes a goal only once the scoreboard shows it, while it can be read', () => {
    const m = new Match()
    m.run(3, 1, 1, 200)
    // "GOAL" half read off another popup, and the score never changed: nothing is told.
    m.look({ middle: ['GOAL'] })
    m.run(8, 1, 1, 196)
    expect(kinds(m.events)).toEqual([])
    expect(m.notes).toContain('a goal popup, but the scoreboard didn’t change: not told')
    // A single misread score is no goal either.
    m.look({ board: board(2, 187, 1) })
    m.run(5, 1, 1, 186)
    expect(kinds(m.events)).toEqual([])
  })

  it('trusts the player’s goal popup when the scoreboard can’t be read', () => {
    const m = new Match()
    m.run(3, 1, 1, 200)
    m.look({ board: null, middle: ['GOAL', '+100'] })
    for (let i = 0; i < 5; i++) m.look({ board: null })
    expect(kinds(m.events)).toEqual(['goal_scored'])
    // When the board comes back showing it, it isn't a second goal.
    m.run(6, 2, 1, 180)
    expect(kinds(m.events)).toEqual(['goal_scored'])
  })

  it('tells shots that didn’t go in, centers, clears and kickoff touches', () => {
    const m = new Match()
    m.run(3, 0, 0, 300)
    m.look({ middle: ['FIRST TOUCH'] })
    m.look({ middle: ['FIRST TOUCH'] })
    m.run(5, 0, 0, 290)
    m.look({ middle: ['SHOT ON GOAL', '+10'] })
    m.look({ middle: ['SHOT ON GOAL', '+10'] })
    m.run(8, 0, 0, 280)
    m.look({ middle: ['CENTER BALL', '+10'] })
    m.run(3, 0, 0, 270)
    m.look({ middle: ['CLEAR BALL'] })
    m.look({ middle: ['EPIC SAVE'] })
    m.look({ middle: ['SAVE'] })
    expect(kinds(m.events)).toEqual([
      'first_touch',
      'shot_on_goal',
      'ball_centered',
      'ball_cleared',
      'epic_save',
      'save',
      'defensive_stand'
    ])
  })

  it('tells a goal straight from the kickoff: the clock running again after standing still', () => {
    const m = new Match()
    for (let i = 0; i < 5; i++) m.look({ board: board(0, 300, 0) })
    m.look({ board: board(0, 299, 0) })
    m.look({ board: board(0, 298, 0) })
    m.look({ board: board(1, 297, 0), middle: ['GOAL'] })
    m.run(6, 1, 0, 296)
    expect(m.notes).toContain('kickoff')
    expect(m.events[0].detail).toMatch(/straight from the kickoff/)
  })

  it('takes neither a clock it couldn’t read for a while nor "GO" inside "GOAL" for a kickoff', () => {
    const m = new Match()
    m.run(3, 0, 0, 200)
    for (let i = 0; i < 5; i++) m.look({ board: board(0, null, 0), middle: ['GO'] })
    m.run(3, 0, 0, 192)
    expect(m.notes).not.toContain('kickoff')
  })

  it('ignores the words of the match scoreboard held open', () => {
    const m = new Match()
    m.run(2, 0, 0, 300)
    m.look({ middle: ['SCORE', 'GOALS', 'ASSISTS', 'SAVES', 'SHOTS', 'ASSIST'] })
    m.run(8, 0, 0, 297)
    expect(m.events).toEqual([])
  })

  it('tells the last seconds of a close game, overtime, and the overtime winner', () => {
    const m = new Match()
    m.run(3, 2, 2, 33)
    m.run(3, 2, 2, 30)
    m.run(28, 2, 2, 27)
    for (let i = 0; i < 3; i++) m.look({ board: board(2, i, 2, true) })
    m.look({ board: board(3, 4, 2, true), middle: ['GOAL'] })
    m.run(6, 3, 2, 4)
    expect(kinds(m.events)).toEqual(['final_seconds', 'overtime_started', 'goal_scored', 'victory'])
    expect(m.events[2].tier).toBe('exceptional')
  })

  it('tells a win or a loss when time runs out, then starts a new match', () => {
    const m = new Match()
    m.run(3, 1, 3, 5)
    for (let i = 0; i < 8; i++) m.look({ board: board(1, 0, 3) })
    expect(kinds(m.events).at(-1)).toBe('defeat')
    m.run(3, 0, 0, 300)
    m.look({ board: board(1, 296, 0), middle: ['GOAL'] })
    m.run(6, 1, 0, 295)
    expect(kinds(m.events).at(-1)).toBe('goal_scored')
    expect(m.notes).toContain('a new match')
  })

  it('tells a comeback after being two down', () => {
    const m = new Match()
    m.run(3, 0, 2, 200)
    m.look({ board: board(1, 196, 2), middle: ['GOAL'] })
    m.run(6, 1, 2, 195)
    m.look({ board: board(2, 190, 2), middle: ['MATE SCORED!'] })
    m.run(6, 2, 2, 189)
    expect(kinds(m.events)).toEqual(['goal_scored', 'teammate_goal(MATE)', 'comeback'])
  })
})

describe('through the commentary pipeline', () => {
  it('offers each kind of moment for a comment, and speaks for the goal', async () => {
    const said: string[][] = []
    let clock = 0
    const c = new Commentator({
      now: () => clock,
      generate: async () => 'What a goal, right into the top corner of the net!',
      deliver: (_text, events) => said.push(events.map((e) => e.type))
    })
    const game = { id: 'rocket', name: 'Rocket League', competitive: true }
    const m = new Match()
    m.run(3, 0, 0, 300)
    m.look({ middle: ['SHOT ON GOAL'] })
    m.look({ board: board(1, 296, 0), middle: ['GOAL', 'AERIAL GOAL'] })
    m.run(6, 1, 0, 295)
    clock = m.t
    c.observe(
      {
        time: m.t,
        source: 'game',
        adapterId: 'rocket-league',
        phase: 'playing',
        inFight: false,
        score: null,
        description: '',
        events: m.events
      },
      game
    )
    clock += 4000
    await c.speakIfDue({
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
    })
    expect(said).toEqual([['goal_scored']])
  })
})
