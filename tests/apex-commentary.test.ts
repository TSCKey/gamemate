// Apex Legends commentary: what the text reader's reading of the HUD becomes, look by look, and
// how a whole fight is told. The HUD texts are as read off the owner's clips (English client).
import { describe, expect, it } from 'vitest'
import {
  ApexWatch,
  feedLine,
  legendName,
  rosterFrom,
  sameName,
  type ApexRead
} from '../src/main/companion/apexReading'
import { apexEngagement } from '../src/main/geis/rules/apexEngagement'
import { runRule } from '../src/main/geis/correlation'
import { Commentator } from '../src/main/companion/commentator'
import type { GameEvent } from '../src/main/companion/events'
import type { OcrSegment } from '../src/main/ocr/paddleOcr'

const seg = (text: string, x: number, y: number, width = 90, height = 20): OcrSegment => ({
  text,
  score: 0.95,
  x,
  y,
  width,
  height
})

// One kill-feed line at row `row`: attacker, a gap for the weapon icon, victim.
const line = (attacker: string, victim: string, row: number): OcrSegment[] => [
  seg(attacker, 100, 200 + row * 30),
  seg(victim, 330, 200 + row * 30)
]
const text = (t: string, row: number): OcrSegment => seg(t, 60, 200 + row * 30, 400)
const squads = (n: number): OcrSegment => seg(`${n} SQUADS LEFT`, 300, 20, 160)

// The squad panel with two teammates above the player's own row.
const TEAM = [
  seg('uradopted', 30, 50),
  seg('Squirtle', 30, 116),
  seg('NEXT LVL: 769 EVO', 30, 184, 160),
  seg('TSCkey', 30, 225)
]

const PLAYER = ['TSCKey']

function look(over: Partial<ApexRead> = {}): ApexRead {
  return { feed: [], center: [], bottom: [], top: [], team: null, ring: null, ...over }
}

// Plays looks one after the other (time in seconds) and gathers every event.
function play(watch: ApexWatch, looks: [number, Partial<ApexRead>][]): GameEvent[] {
  return looks.flatMap(([t, read]) => watch.absorb(look(read), t * 1000, PLAYER).events)
}
const kinds = (events: GameEvent[]): string[] =>
  events.map((e) => `${e.type}${e.count > 1 ? e.count : ''}${e.opponent ? `(${e.opponent})` : ''}`)

describe('reading a kill-feed line', () => {
  it('takes "[Bleed Out]" and "[Finisher]" for eliminations', () => {
    expect(feedLine([seg('TSCkey [Bleed Out] ID_Keyzz', 100, 0, 300)])).toEqual({
      attacker: 'TSCkey',
      victim: 'ID_Keyzz',
      eliminated: true
    })
    expect(feedLine([seg('bvsu', 100, 0), seg('[Finisher] TomyPapy', 200, 0)])?.eliminated).toBe(
      true
    )
  })

  it('takes any other line for a knock or an elimination it can’t tell apart', () => {
    expect(feedLine(line('TSCkey', 'gaiamarcus9', 0))).toEqual({
      attacker: 'TSCkey',
      victim: 'gaiamarcus9',
      eliminated: false
    })
    // The weapon or ability in brackets after the attacker is no part of a name.
    expect(
      feedLine([seg('TSCkey [The Motherlode]', 100, 0, 200), seg('gaiamarcus9', 360, 0)])
    ).toMatchObject({ attacker: 'TSCkey', victim: 'gaiamarcus9' })
  })

  it('leaves out pings and other messages', () => {
    expect(feedLine([text('uradopted spotted an enemy.', 0)])).toBeNull()
    expect(feedLine([text('You - Enemy Audio here.', 0)])).toBeNull()
    expect(feedLine([text('8 SQUADS LEFT', 0)])).toBeNull()
  })
})

describe('names read by OCR', () => {
  it('knows a name read a letter or two off', () => {
    expect(sameName('TSCkey', 'TSCkay')).toBe(true)
    expect(sameName('ID_Keyzz', 'ID_Keyzz ed')).toBe(true)
    expect(sameName('Gshf', 'Squirtle')).toBe(false)
  })

  it('knows a legend from a misread, and no legend from a line cut short', () => {
    expect(legendName('Dctane')).toBe('Octane')
    expect(legendName('Caustic')).toBe('Caustic')
    expect(legendName('Vara')).toBeNull()
  })

  it('finds the teammates in the squad panel, above the player’s row', () => {
    expect(rosterFrom(TEAM, PLAYER)).toEqual(['uradopted', 'Squirtle'])
    expect(rosterFrom([seg('Backpack', 30, 40)], PLAYER)).toBeNull()
  })
})

describe('combat', () => {
  it('tells an ordinary fight: a shield broken, then the player’s knock, once', () => {
    const events = play(new ApexWatch(), [
      [0, { team: TEAM, feed: [text('Enemy Shield Broken - Caustic', 0)] }],
      [3, { center: [seg('KNOCKED DOWN GAIAMARCUS9 +150', 200, 20, 400)] }],
      // The same notice and the player's own feed line for that knock, on the next look.
      [
        5,
        {
          center: [seg('KNOCKED DOWN GAIAMARCUS9 +150', 200, 20, 400)],
          feed: line('TSCkey', 'gaiamarcus9', 1)
        }
      ]
    ])
    expect(kinds(events)).toEqual(['shield_break(Caustic)', 'knock(GAIAMARCUS9)'])
  })

  it('never makes a knock into a kill: only the game’s elimination says one', () => {
    const watch = new ApexWatch()
    const knocks = play(watch, [
      [0, { team: TEAM, feed: line('TSCkey', 'gaiamarcus9', 0) }],
      [3, { feed: line('TSCkey', 'gaiamarcus9', 0) }]
    ])
    expect(kinds(knocks)).toEqual(['knock(gaiamarcus9)'])
    const kill = play(watch, [
      [6, { feed: [seg('TSCkey [Bleed Out] gaiamarcus9', 100, 230, 300)] }]
    ])
    expect(kinds(kill)).toEqual(['kill(gaiamarcus9)'])
  })

  it('names a knock as the feed writes it when the notice was misread', () => {
    const events = play(new ApexWatch(), [
      [
        0,
        {
          team: TEAM,
          feed: line('TSCkey', 'Li77waakk', 0),
          center: [seg('KNOCKEDDOWNWAAKI+150', 200, 20, 400)]
        }
      ]
    ])
    expect(kinds(events)).toEqual(['knock(Li77waakk)'])
  })

  it('makes knocks a few seconds apart one burst, growing', () => {
    const events = play(new ApexWatch(), [
      [0, { team: TEAM, feed: line('TSCkey', 'Gshf', 0) }],
      [4, { feed: [...line('TSCkey', 'Gshf', 0), ...line('TSCkey', 'Li77waakk', 1)] }],
      [8, { feed: line('TSCkey', 'low sugar DADDY', 2) }]
    ])
    expect(kinds(events).filter((k) => k.startsWith('multi_knock'))).toEqual([
      'multi_knock2',
      'multi_knock3'
    ])
  })

  it('tells a teammate going down without saying they died', () => {
    const events = play(new ApexWatch(), [[0, { team: TEAM, feed: line('Gshf', 'uradopted', 0) }]])
    expect(kinds(events)).toEqual(['teammate_down(uradopted)'])
    expect(events[0].detail).toBe('Teammate uradopted went down to Gshf.')
  })
})

describe('squads', () => {
  it('calls a squad wiped when the count drops right after the squad’s elimination', () => {
    const events = play(new ApexWatch(), [
      [0, { team: TEAM, feed: [squads(8)] }],
      [3, { feed: [squads(8)] }],
      [6, { feed: [squads(8), seg('uradopted [Bleed Out] Gshf', 100, 230, 300)] }],
      // A death box may cover the counter after one read.
      [9, { feed: [squads(7)] }]
    ])
    expect(kinds(events)).toContain('team_wipe')
  })

  it('takes no drop elsewhere on the map, or a single misread, for the squad’s', () => {
    const events = play(new ApexWatch(), [
      [0, { feed: [squads(8)] }],
      [3, { feed: [squads(8)] }],
      [6, { feed: [squads(6)] }],
      [9, { feed: [squads(8)] }],
      [12, { feed: [squads(7)] }],
      [15, { feed: [squads(7)] }]
    ])
    expect(kinds(events)).toEqual([])
  })

  it('calls a third party when more enemies fight than one squad has', () => {
    const shields = ['Caustic', 'Sparrow', 'Gibraltar', 'Octane'].map((l, i) =>
      text(`Enemy Shield Broken - ${l}`, i)
    )
    const events = play(new ApexWatch(), [
      [0, { team: TEAM, feed: shields.slice(0, 2) }],
      [4, { feed: shields }]
    ])
    expect(kinds(events)).toContain('third_party')
  })

  it('takes no misread or cut-short name for an extra enemy', () => {
    const shields = ['Vantage', 'Octane', 'Dctane', 'Loba', 'Vara'].map((l, i) =>
      text(`Enemy Shield Broken - ${l}`, i)
    )
    expect(kinds(play(new ApexWatch(), [[0, { team: TEAM, feed: shields }]]))).not.toContain(
      'third_party'
    )
  })

  it('says the endgame once, at three squads left', () => {
    const events = play(
      new ApexWatch(),
      [5, 5, 4, 4, 3, 3, 2, 2].map((n, i): [number, Partial<ApexRead>] => [
        i * 3,
        { feed: [squads(n)] }
      ])
    )
    expect(kinds(events)).toEqual(['final_squads3'])
  })
})

describe('the player, the squad and the match', () => {
  it('follows being knocked, eliminated and having the banner picked up', () => {
    const events = play(new ApexWatch(), [
      [0, { team: TEAM, feed: line('[ZIZI] L’Anguille', 'TSCkey', 0) }],
      [1, { bottom: [seg('Knockdown Shield', 200, 18, 200, 28)] }],
      [4, { bottom: [seg('Knockdown Shield', 200, 18, 200, 28)] }],
      [8, { feed: [seg('AWAITING RESPAWN', 94, 50, 200)] }],
      [11, { feed: [seg('AWAITING RESPAWN', 94, 50, 200)] }],
      [20, { team: [seg('TSCkey', 30, 51), seg('DELIVER TO BEACON', 30, 73, 160)] }]
    ])
    expect(kinds(events)).toEqual([
      'player_knocked',
      'death([ZIZI] L’Anguille)',
      'banner_recovered'
    ])
  })

  it('tells the ring closing once per round', () => {
    const ring = (t: string): OcrSegment[] => [seg(t, 10, 20, 200)]
    const events = play(new ApexWatch(), [
      [0, { ring: ring('ROUND1-CLOSING') }],
      [10, { ring: ring('ROUNDT-CLOSING') }],
      [20, { ring: ring('ROUND 2') }],
      [200, { ring: ring('ROUND 2 - CLOSING') }]
    ])
    expect(kinds(events)).toEqual(['ring_closing', 'ring_closing2'])
  })

  it('tells only the player becoming kill leader', () => {
    const events = play(new ApexWatch(), [
      [0, { feed: [text('uradopted is the new Kill Leader with 5 kills.', 0)] }],
      [3, { feed: [text('TSCkey is the new Kill Leader with 6 kills.', 1)] }],
      [6, { feed: [text('TSCkey is the new Kill Leader with 6 kills.', 1)] }]
    ])
    expect(kinds(events)).toEqual(['kill_leader6'])
  })

  it('tells a win once, from "CHAMPION" as it ends or the summary, never the intro', () => {
    const won = play(new ApexWatch(), [
      [0, { bottom: [seg('CHAMPION', 300, 40, 200, 34)] }],
      [3, { bottom: [seg('CHAMPION', 300, 40, 200, 34)] }],
      [12, { top: [seg('SUMMARY', 300, 20, 120, 20), seg('CHAMPIONS', 300, 180, 200, 34)] }]
    ])
    expect(kinds(won)).toEqual(['victory'])
    // At the start of a match Apex introduces last match's top squad.
    const intro = play(new ApexWatch(), [
      [0, { top: [seg('CHAMPION SQUAD', 143, 46, 300, 34)] }],
      [3, { feed: [text('Champion Slayer bonus', 0)] }]
    ])
    expect(kinds(intro)).toEqual([])
    const out = play(new ApexWatch(), [[0, { feed: [seg('Requeue Party of 3', 0, 10, 200)] }]])
    expect(kinds(out)).toEqual(['defeat'])
  })

  it('takes no misread squad count for a new match near the end of one', () => {
    const watch = new ApexWatch()
    const endgame = play(
      watch,
      [5, 5, 3, 3, 30, 30, 3].map((n, i): [number, Partial<ApexRead>] => [
        i * 5,
        { feed: [squads(n)] }
      ])
    )
    expect(kinds(endgame)).toEqual(['final_squads3'])
    // A real new match: the count stays up.
    const next = play(
      watch,
      [20, 20, 20, 20, 19, 19].map((n, i): [number, Partial<ApexRead>] => [
        100 + i * 10,
        { feed: [squads(n)] }
      ])
    )
    expect(kinds(next)).toEqual([])
    expect(watch.state(160_000).squadsLeft).toBe(19)
  })
})

describe('a whole fight told as one moment', () => {
  // The events of a fight as the reader gives them.
  function fight(script: [number, Partial<ApexRead>][]): GameEvent[] {
    const watch = new ApexWatch()
    const events = play(watch, script).map((e) => ({ ...e, adapterId: 'apex' }))
    return runRule(apexEngagement, events, 'competitive')
  }
  // A look long after, so the fight is over (rules close a fight on the next look after it).
  const later = (at: number): [number, Partial<ApexRead>] => [
    at,
    { ring: [seg('ROUND 2 - CLOSING', 10, 20, 200)] }
  ]

  it('calls it a clutch when the player wins it with the rest of the squad down', () => {
    const told = fight([
      [0, { team: TEAM, feed: line('Gshf', 'uradopted', 0) }],
      [3, { feed: line('Li77waakk', 'Squirtle', 1) }],
      [6, { feed: line('TSCkey', 'Gshf', 2) }],
      [9, { feed: [seg('TSCkey [Bleed Out] Gshf', 100, 290, 300)] }],
      later(60)
    ])
    expect(told.map((e) => e.type)).toEqual(['clutch'])
  })

  it('calls no clutch when the player falls alone', () => {
    const told = fight([
      [0, { team: TEAM, feed: line('Gshf', 'uradopted', 0) }],
      [3, { feed: line('Li77waakk', 'Squirtle', 1) }],
      [6, { feed: line('TSCkey', 'Gshf', 2) }],
      [9, { feed: [seg('Li77waakk [Finisher] TSCkey', 100, 290, 300)] }],
      later(60)
    ])
    expect(told).toEqual([])
  })

  it('calls a messy fight won a chaotic victory, with what went wrong in it', () => {
    const told = fight([
      [0, { team: TEAM, feed: [text('Enemy Shield Broken - Caustic', 0)] }],
      [3, { feed: line('Gshf', 'uradopted', 1) }],
      [6, { feed: line('TSCkey', 'Gshf', 2) }],
      [9, { feed: [seg('TSCkey [Bleed Out] Gshf', 100, 290, 300)] }],
      later(60)
    ])
    expect(told.map((e) => e.type)).toEqual(['chaotic_fight_victory'])
    expect(told[0].detail).toMatch(/a teammate went down/)
  })

  it('adds nothing to a clean fight: its knocks and eliminations say it', () => {
    const told = fight([
      [0, { team: TEAM, feed: [text('Enemy Shield Broken - Caustic', 0)] }],
      [3, { feed: line('TSCkey', 'Gshf', 1) }],
      [6, { feed: [seg('TSCkey [Bleed Out] Gshf', 100, 260, 300)] }],
      later(60)
    ])
    expect(told).toEqual([])
  })
})

describe('what the companion says, and when', () => {
  const APEX = { id: 'apex', name: 'Apex Legends', competitive: true }
  const ALL = {
    combat: true,
    skill: true,
    teamwork: true,
    objectives: true,
    match: true,
    world: true
  }
  function companion(): {
    look: (t: number, read: Partial<ApexRead>) => void
    speak: (t: number) => Promise<void>
    said: string[][]
    prompts: string[]
  } {
    let clock = 0
    let n = 0
    const said: string[][] = []
    const prompts: string[] = []
    const watch = new ApexWatch()
    const commentator = new Commentator({
      now: () => clock,
      generate: async (prompt) => {
        prompts.push(prompt)
        n++
        return `Line ${'abcdefghij'[n]} number ${n * 7919} said ${n}`
      },
      deliver: (_text, events) => said.push(events.map((e) => e.type))
    })
    return {
      said,
      prompts,
      look: (t, read) => {
        clock = t * 1000
        commentator.observe(watch.absorb(look(read), clock, PLAYER), APEX)
      },
      speak: async (t) => {
        clock = t * 1000
        await commentator.speakIfDue({
          frequency: 'frequent',
          intensity: 'normal',
          humor: 'light',
          categories: ALL,
          tactics: false,
          language: 'en',
          game: APEX
        })
      }
    }
  }

  it('waits for a fight to calm down, then says it in one comment', async () => {
    const c = companion()
    c.look(0, { team: TEAM, feed: line('TSCkey', 'Gshf', 0) })
    await c.speak(4)
    expect(c.said).toEqual([])
    c.look(5, { feed: line('TSCkey', 'Li77waakk', 1) })
    await c.speak(8)
    expect(c.said).toEqual([])
    await c.speak(18)
    expect(c.said).toHaveLength(1)
    expect(c.said[0]).toContain('multi_knock')
    expect(c.prompts[0]).toMatch(/Knocks, not eliminations/)
  })

  it('speaks up at once for a third party, even mid-fight', async () => {
    const c = companion()
    const shields = ['Caustic', 'Sparrow', 'Gibraltar', 'Octane'].map((l, i) =>
      text(`Enemy Shield Broken - ${l}`, i)
    )
    c.look(0, { team: TEAM, feed: shields })
    await c.speak(4)
    expect(c.said.flat()).toContain('third_party')
  })
})
