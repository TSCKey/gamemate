// Apex Legends' health and shield bars and the squad's cards, read by their colours, and what the
// companion makes of their changes over time. Pixel positions as measured on the owner's clips at
// 1080p; the clips never show the player's health going down or a revive, so those are simulated.
import { describe, expect, it } from 'vitest'
import {
  apexHudBox,
  readPlayerBars,
  readTeammates,
  type BgraImage,
  type PlayerBars,
  type TeammateState
} from '../src/main/geis/adapters/apexBars'
import { ApexWatch, type ApexRead } from '../src/main/companion/apexReading'
import { apexEngagement } from '../src/main/geis/rules/apexEngagement'
import { runRule } from '../src/main/geis/correlation'
import { Commentator } from '../src/main/companion/commentator'
import type { GameEvent } from '../src/main/companion/events'
import type { OcrSegment } from '../src/main/ocr/paddleOcr'

const WHITE = [250, 250, 250]
const BLUE = [30, 160, 250]
const PURPLE = [170, 70, 230]
const RED = [210, 40, 40]
const GREEN = [120, 210, 60]
const SCENE = [110, 60, 45]

// The bottom-left HUD at 1080p as the reader cuts it out (300 x 225 from 130, 800).
function hud(
  player: { health: number; shield: number; colour?: number[] } | null,
  teammates: (TeammateState | null)[] = []
): BgraImage {
  const box = apexHudBox({ x: 0, y: 0, width: 1920, height: 1080 })
  const data = new Uint8Array(box.width * box.height * 4)
  const paint = (x0: number, x1: number, y0: number, y1: number, [r, g, b]: number[]): void => {
    for (let y = y0; y < y1; y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++)
        data.set([b, g, r, 255], (y * box.width + x) * 4)
  }
  paint(0, box.width, 0, box.height, SCENE)
  if (player) {
    const width = 282 - 48
    paint(48, 48 + (width * player.health) / 100, 210, 217, WHITE)
    paint(48, 48 + (width * player.shield) / 125, 198, 205, player.colour ?? BLUE)
  }
  teammates.forEach((state, slot) => {
    const y = 85 - 66 * slot
    if (state === 'alive') paint(12, 140, y - 1, y + 6, WHITE)
    if (state === 'knocked') paint(12, 165, y - 1, y + 6, RED)
    if (state === 'eliminated') {
      for (let x = 14; x < 180; x += 6) paint(x, x + 3, y - 6, y + 2, GREEN)
    }
  })
  return { width: box.width, height: box.height, data }
}

describe('reading the bars by their colours', () => {
  it('reads health and shield on the one scale, a full blue armour as 75', () => {
    expect(readPlayerBars(hud({ health: 100, shield: 75 }))).toEqual({
      health: 100,
      shield: 75,
      armour: 'blue'
    })
    const hurt = readPlayerBars(hud({ health: 40, shield: 30, colour: PURPLE }))
    expect(hurt?.armour).toBe('purple')
    expect(hurt?.health).toBeGreaterThanOrEqual(38)
    expect(hurt?.health).toBeLessThanOrEqual(42)
    expect(hurt?.shield).toBeGreaterThanOrEqual(28)
    expect(hurt?.shield).toBeLessThanOrEqual(32)
  })

  it('reads a broken shield as none, never as health', () => {
    expect(readPlayerBars(hud({ health: 60, shield: 0 }))).toMatchObject({
      shield: 0,
      armour: null
    })
  })

  it('reads nothing where the player’s card isn’t (a menu, the player knocked)', () => {
    expect(readPlayerBars(hud(null))).toBeNull()
  })

  it('tells the teammates’ cards apart: alive, knocked, eliminated', () => {
    expect(readTeammates(hud(null, ['alive', 'knocked']))).toEqual(['alive', 'knocked'])
    expect(readTeammates(hud(null, ['eliminated', 'alive']))).toEqual(['eliminated', 'alive'])
    expect(readTeammates(hud(null, ['alive']))).toEqual(['alive', null])
  })

  it('finds the corner at other sizes, from the game’s bottom-left', () => {
    expect(apexHudBox({ x: 0, y: 0, width: 1920, height: 1080 })).toEqual({
      x: 130,
      y: 800,
      width: 300,
      height: 225
    })
    expect(apexHudBox({ x: 0, y: 0, width: 2560, height: 1440 })).toEqual({
      x: 173,
      y: 1067,
      width: 400,
      height: 300
    })
  })
})

const TEAM: OcrSegment[] = [
  { text: 'uradopted', x: 30, y: 50, width: 90, height: 20, score: 0.9 },
  { text: 'Squirtle', x: 30, y: 116, width: 90, height: 20, score: 0.9 },
  { text: 'NEXT LVL: 769 EVO', x: 30, y: 184, width: 160, height: 20, score: 0.9 },
  { text: 'TSCkey', x: 30, y: 225, width: 90, height: 20, score: 0.9 }
]

type Look = [number, PlayerBars | null, (TeammateState | null)[], Partial<ApexRead>?]

function play(looks: Look[], watch = new ApexWatch()): GameEvent[] {
  return looks.flatMap(
    ([t, player, teammates, extra], i) =>
      watch.absorb(
        {
          feed: [],
          center: [],
          bottom: [],
          top: [],
          team: i === 0 ? TEAM : null,
          ring: null,
          bars: { player, teammates },
          ...extra
        },
        t * 1000,
        ['TSCKey']
      ).events
  )
}
const bars = (health: number, shield: number): PlayerBars => ({
  health,
  shield,
  armour: shield > 0 ? 'blue' : null
})
const kinds = (events: GameEvent[]): string[] => events.map((e) => e.type)

describe('the player’s health and shield over time', () => {
  it('says the shield broke once, and critical health once', () => {
    const events = play([
      [0, bars(100, 75), []],
      [3, bars(100, 40), []],
      [6, bars(90, 0), []],
      [9, bars(80, 0), []],
      [12, bars(20, 0), []],
      [15, bars(15, 0), []]
    ])
    expect(kinds(events)).toEqual(['player_shield_broken', 'low_health'])
    expect(events.every((e) => e.basis === 'verified')).toBe(true)
  })

  it('tells heavy damage in a few seconds, without a number', () => {
    const events = play([
      [0, bars(100, 75), []],
      [3, bars(70, 0), []]
    ])
    expect(kinds(events)).toContain('heavy_damage')
    expect(events.find((e) => e.type === 'heavy_damage')?.detail).toBe('')
  })

  it('tells getting back up from critical, and the shield back to full', () => {
    const events = play([
      [0, bars(100, 75), []],
      [3, bars(20, 0), []],
      [20, bars(80, 0), []],
      [30, bars(100, 40), []],
      [40, bars(100, 75), []]
    ])
    expect(kinds(events)).toEqual(['low_health', 'recovery', 'shields_restored'])
  })

  it('reads no bars on a death recap or while spectating', () => {
    const recap: Partial<ApexRead> = {
      feed: [{ text: 'KILLER', x: 0, y: 0, width: 60, height: 20, score: 0.9 }]
    }
    const events = play([
      [0, bars(100, 75), []],
      [3, bars(20, 0), [], recap],
      [6, bars(20, 0), [], recap]
    ])
    expect(kinds(events)).not.toContain('low_health')
  })
})

describe('the squad’s cards over time', () => {
  it('tells a teammate knocked, then revived, once two looks agree, by name', () => {
    const events = play([
      [0, bars(100, 75), ['alive', 'alive']],
      [3, bars(100, 75), ['alive', 'alive']],
      [6, bars(100, 75), ['knocked', 'alive']],
      [9, bars(100, 75), ['knocked', 'alive']],
      [12, bars(100, 75), ['alive', 'alive']],
      [15, bars(100, 75), ['alive', 'alive']]
    ])
    expect(events.map((e) => `${e.type}(${e.opponent})`)).toEqual([
      'teammate_down(Squirtle)',
      'teammate_revived(Squirtle)'
    ])
    expect(events[0].detail).toBe('Teammate Squirtle was knocked down.')
  })

  it('tells an elimination and a respawn apart from a knock and a revive', () => {
    const events = play([
      [0, bars(100, 75), ['alive', 'alive']],
      [3, bars(100, 75), ['alive', 'alive']],
      [6, bars(100, 75), ['alive', 'eliminated']],
      [9, bars(100, 75), ['alive', 'eliminated']],
      [60, bars(100, 75), ['alive', 'alive']],
      [63, bars(100, 75), ['alive', 'alive']]
    ])
    expect(kinds(events)).toEqual(['teammate_down', 'teammate_respawned'])
    expect(events[0].detail).toBe('Teammate uradopted was eliminated.')
  })

  it('takes no single odd reading for a change', () => {
    const events = play([
      [0, bars(100, 75), ['alive', 'alive']],
      [3, bars(100, 75), ['alive', 'alive']],
      [6, bars(100, 75), ['knocked', 'alive']],
      [9, bars(100, 75), ['alive', 'alive']]
    ])
    expect(events).toEqual([])
  })

  it('says a teammate went down once when the feed already said it', () => {
    const feed: Partial<ApexRead> = {
      feed: [
        { text: 'Gshf', x: 100, y: 200, width: 90, height: 20, score: 0.9 },
        { text: 'Squirtle', x: 330, y: 200, width: 90, height: 20, score: 0.9 }
      ]
    }
    const events = play([
      [0, bars(100, 75), ['alive', 'alive']],
      [3, bars(100, 75), ['alive', 'alive'], feed],
      [6, bars(100, 75), ['knocked', 'alive'], feed],
      [9, bars(100, 75), ['knocked', 'alive'], feed]
    ])
    expect(kinds(events)).toEqual(['teammate_down'])
  })
})

describe('fights with the bars in them', () => {
  const withApex = (events: GameEvent[]): GameEvent[] =>
    events.map((e) => ({ ...e, adapterId: 'apex' }))
  const later = (t: number): Look => [t, bars(100, 75), ['alive', 'alive']]

  it('calls getting out alive from critical health an escape, nothing more', () => {
    const told = runRule(
      apexEngagement,
      withApex(
        play([
          [0, bars(100, 75), ['alive', 'alive']],
          [3, bars(60, 0), ['alive', 'alive']],
          [6, bars(15, 0), ['alive', 'alive']],
          later(60)
        ])
      ),
      'competitive'
    )
    expect(told.map((e) => e.type)).toEqual(['successful_escape'])
  })

  it('counts critical health and a revive in a chaotic fight won', () => {
    const line = (a: string, v: string, row: number): OcrSegment[] => [
      { text: a, x: 100, y: 200 + row * 30, width: 90, height: 20, score: 0.9 },
      { text: v, x: 330, y: 200 + row * 30, width: 90, height: 20, score: 0.9 }
    ]
    const bleed = (v: string): OcrSegment[] => [
      { text: `TSCkey [Bleed Out] ${v}`, x: 100, y: 290, width: 300, height: 20, score: 0.9 }
    ]
    const told = runRule(
      apexEngagement,
      withApex(
        play([
          [0, bars(100, 75), ['alive', 'alive'], { feed: line('TSCkey', 'Gshf', 0) }],
          [3, bars(15, 0), ['knocked', 'alive'], { feed: line('TSCkey', 'Li77waakk', 1) }],
          [6, bars(15, 0), ['knocked', 'alive']],
          [9, bars(30, 0), ['alive', 'alive'], { feed: bleed('Gshf') }],
          [12, bars(30, 0), ['alive', 'alive']],
          later(60)
        ])
      ),
      'competitive'
    )
    expect(told.map((e) => e.type)).toEqual(['chaotic_fight_victory'])
    expect(told[0].detail).toMatch(/critically low/)
    expect(told[0].detail).toMatch(/a teammate revived/)
  })

  it('never says the player did a revive it can’t see them do', async () => {
    let clock = 0
    const prompts: string[] = []
    const commentator = new Commentator({
      now: () => clock,
      generate: async (prompt) => {
        prompts.push(prompt)
        return 'Good to have them back up again'
      },
      deliver: () => {}
    })
    const watch = new ApexWatch()
    const looks: Look[] = [
      [0, bars(100, 75), ['knocked', 'alive']],
      [3, bars(100, 75), ['knocked', 'alive']],
      [6, bars(100, 75), ['alive', 'alive']],
      [9, bars(100, 75), ['alive', 'alive']]
    ]
    for (const [t, player, teammates] of looks) {
      clock = t * 1000
      const read = {
        feed: [],
        center: [],
        bottom: [],
        top: [],
        team: t === 0 ? TEAM : null,
        ring: null
      }
      commentator.observe(
        watch.absorb({ ...read, bars: { player, teammates } }, clock, ['TSCKey']),
        {
          id: 'apex',
          name: 'Apex Legends',
          competitive: true
        }
      )
    }
    clock = 13_000
    await commentator.speakIfDue({
      frequency: 'frequent',
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
      game: { id: 'apex', name: 'Apex Legends', competitive: true }
    })
    expect(prompts[0]).toMatch(/never say the player did/)
  })
})

describe('readings that can’t be right', () => {
  it('reads more shield than the armour holds, or a sliver, as no shield reading', () => {
    // A blue run past its 75, as the live 1080p game once read.
    expect(readPlayerBars(hud({ health: 100, shield: 98 }))).toMatchObject({
      health: 100,
      shield: null,
      armour: null
    })
    expect(readPlayerBars(hud({ health: 100, shield: 1, colour: PURPLE }))?.shield).toBeNull()
  })

  it('goes on health alone while the shield can’t be read', () => {
    const unread = (health: number): PlayerBars => ({ health, shield: null, armour: null })
    const events = play([
      [0, unread(100), []],
      [3, unread(100), []],
      [6, unread(20), []]
    ])
    expect(kinds(events)).toEqual(['low_health'])
  })

  it('leaves the recovery from critical health to the fight’s escape, said once', async () => {
    const { MatchMemory } = await import('../src/main/companion/matchMemory')
    const memory = new MatchMemory()
    const watch = new ApexWatch()
    const derived: string[] = []
    for (const [t, health] of [
      [0, 100],
      [3, 20],
      [20, 90]
    ]) {
      const report = watch.absorb(
        {
          feed: [],
          center: [],
          bottom: [],
          top: [],
          team: null,
          ring: null,
          bars: { player: bars(health, 0), teammates: [] }
        },
        t * 1000,
        ['TSCKey']
      )
      derived.push(...memory.absorb(report).map((e) => e.type))
    }
    expect(derived).not.toContain('recovery')
  })
})
