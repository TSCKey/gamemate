import { describe, expect, it } from 'vitest'
import { parsePlayerNames, readAreas } from '../src/main/companion/areaReading'

const NAMES = ['TSCKEY']

const reply = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  feed_lines: [],
  banner_text: '',
  banner_kind: 'none',
  banner_name: '',
  ...over
})
const line = (left: string, right: string): { left: string; right: string } => ({ left, right })
const kinds = (raw: unknown, names = NAMES): string[] =>
  readAreas(raw, 1000, names).events.map((e) => e.type)

describe('working out the player’s own lines in the feed', () => {
  it('counts a line with the player on the left as their kill', () => {
    const { events } = readAreas(reply({ feed_lines: [line('TSCKEY', 'Sova')] }), 1000, NAMES)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'kill', opponent: 'Sova', time: 1000 })
  })

  it('counts a line with the player on the right as their death', () => {
    const { events } = readAreas(reply({ feed_lines: [line('Sova', 'TSCKEY')] }), 1000, NAMES)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'death', opponent: 'Sova' })
  })

  it('leaves out lines between other players', () => {
    expect(kinds(reply({ feed_lines: [line('Raze', 'Omen'), line('Sage', 'Cypher')] }))).toEqual([])
  })

  it('finds the player among other lines', () => {
    const lines = [line('Raze', 'Omen'), line('TSCKEY', 'Sova'), line('Sage', 'Cypher')]
    expect(kinds(reply({ feed_lines: lines }))).toEqual(['kill'])
  })

  it('does not care about capitals', () => {
    expect(kinds(reply({ feed_lines: [line('TscKey', 'Sova')] }))).toEqual(['kill'])
  })

  it('sees the name behind a clan tag', () => {
    expect(kinds(reply({ feed_lines: [line('[ABC] TSCKEY', 'Sova')] }))).toEqual(['kill'])
  })

  it('does not take a short name for part of someone else’s', () => {
    expect(kinds(reply({ feed_lines: [line('Mercy', 'Sova')] }), ['Me'])).toEqual([])
    expect(kinds(reply({ feed_lines: [line('Me', 'Sova')] }), ['Me'])).toEqual(['kill'])
  })

  it('tries every name the player gave', () => {
    const names = ['Other', 'TSCKEY']
    expect(kinds(reply({ feed_lines: [line('TSCKEY', 'Sova')] }), names)).toEqual(['kill'])
  })

  it('uses no feed lines when it does not know the name', () => {
    expect(kinds(reply({ feed_lines: [line('TSCKEY', 'Sova')] }), [])).toEqual([])
  })

  it('reports a line once even if it was copied twice', () => {
    const lines = [line('TSCKEY', 'Sova'), line('TSCKEY', 'Sova')]
    expect(kinds(reply({ feed_lines: lines }))).toEqual(['kill'])
  })

  it('leaves out a line where the player is both sides', () => {
    expect(kinds(reply({ feed_lines: [line('TSCKEY', 'TSCKEY')] }))).toEqual([])
  })

  it('keeps a name from the screen to one short line', () => {
    const { events } = readAreas(
      reply({ feed_lines: [line('TSCKEY', `Sova\n\n${'x'.repeat(100)}`)] }),
      1000,
      NAMES
    )
    expect(events[0].opponent.length).toBeLessThanOrEqual(32)
    expect(events[0].opponent).not.toMatch(/\n/)
  })

  it('gives every event a line for the log', () => {
    const { events } = readAreas(reply({ feed_lines: [line('TSCKEY', 'Sova')] }), 1000, NAMES)
    expect(events[0].detail).not.toBe('')
  })
})

describe('working out what a banner means', () => {
  it.each([
    ['VICTORY', 'victory'],
    ['DEFEAT', 'defeat'],
    ['ROUND WON', 'round_won'],
    ['ROUND LOST', 'round_lost'],
    ['Victory Royale', 'victory'],
    ['SIEG', 'victory'],
    ['NIEDERLAGE', 'defeat'],
    ['RUNDE GEWONNEN', 'round_won'],
    ['RUNDE VERLOREN', 'round_lost'],
    ['DÉFAITE', 'defeat'],
    ['ПОБЕДА', 'victory'],
    ['YENİLGİ', 'defeat'],
    ['هزيمة', 'defeat'],
    ['勝利', 'victory'],
    ['패배', 'defeat'],
    ['胜利', 'victory']
  ])('reads %s as %s from the words themselves', (banner_text, type) => {
    expect(kinds(reply({ banner_text }))).toEqual([type])
  })

  it('ignores numbers next to the words', () => {
    expect(kinds(reply({ banner_text: 'ROUND 5 LOST' }))).toEqual(['round_lost'])
    expect(kinds(reply({ banner_text: '#1 VICTORY ROYALE' }))).toEqual(['victory'])
  })

  // On the real model every one of these came back as a win at least once.
  it.each([
    'ROUND 5',
    'MATCH POINT',
    'CLUTCH',
    'THRIFTY',
    'SWITCHING SIDES',
    'BUY PHASE',
    'SPIKE PLANTED',
    'ENEMY DEFEATED',
    'COUNTER-TERRORISTS WIN',
    'HELD WECHSELN'
  ])('never takes %s for a result, whatever the model says it means', (banner_text) => {
    for (const banner_kind of ['victory', 'round_won', 'defeat', 'round_lost']) {
      expect(kinds(reply({ banner_kind, banner_text }))).toEqual([])
    }
  })

  it('quotes the banner', () => {
    const { events } = readAreas(reply({ banner_text: 'SIEG' }), 1000, NAMES)
    expect(events[0].detail).toContain('SIEG')
  })

  it('knows who eliminated the player', () => {
    const { events } = readAreas(
      reply({ banner_kind: 'killed_by', banner_text: 'KILLED BY Sova', banner_name: 'Sova' }),
      1000,
      NAMES
    )
    expect(events[0]).toMatchObject({ type: 'death', opponent: 'Sova' })
  })

  it('counts a death even without a name', () => {
    expect(kinds(reply({ banner_kind: 'killed_by', banner_text: 'YOU DIED' }))).toEqual(['death'])
  })

  it('does not believe a killer whose name is not in the banner', () => {
    const { events } = readAreas(
      reply({ banner_kind: 'killed_by', banner_text: 'YOU DIED', banner_name: 'Sova' }),
      1000,
      NAMES
    )
    expect(events[0]).toMatchObject({ type: 'death', opponent: '' })
  })

  it('counts a kill banner with a name', () => {
    const { events } = readAreas(
      reply({
        banner_kind: 'eliminated_enemy',
        banner_text: 'ELIMINATED Sova',
        banner_name: 'Sova'
      }),
      1000,
      NAMES
    )
    expect(events[0]).toMatchObject({ type: 'kill', opponent: 'Sova' })
  })

  it('leaves out a kill banner without a name, which would count again on the next look', () => {
    expect(kinds(reply({ banner_kind: 'eliminated_enemy', banner_text: 'ELIMINATED' }))).toEqual([])
  })

  it('does not believe a kill whose name is not in the banner', () => {
    const raw = reply({
      banner_kind: 'eliminated_enemy',
      banner_text: 'THRIFTY',
      banner_name: 'Sova'
    })
    expect(kinds(raw)).toEqual([])
  })

  it('does not take a number for a name', () => {
    const raw = reply({ banner_kind: 'eliminated_enemy', banner_text: 'ROUND 5', banner_name: '5' })
    expect(kinds(raw)).toEqual([])
  })

  it('does not believe a banner with no text', () => {
    expect(kinds(reply({ banner_kind: 'killed_by', banner_text: '' }))).toEqual([])
    expect(kinds(reply({ banner_kind: 'killed_by', banner_text: '   ' }))).toEqual([])
  })

  it('ignores a kind it does not know', () => {
    expect(kinds(reply({ banner_kind: 'something', banner_text: 'X' }))).toEqual([])
  })

  it('counts the same kill once when the feed and a banner both show it', () => {
    const raw = reply({
      feed_lines: [line('TSCKEY', 'Sova')],
      banner_kind: 'eliminated_enemy',
      banner_text: 'ELIMINATED Sova',
      banner_name: 'Sova'
    })
    expect(kinds(raw)).toEqual(['kill'])
  })
})

describe('the report from one look', () => {
  it('is a report from the screen', () => {
    expect(readAreas(reply(), 1000, NAMES)).toMatchObject({
      time: 1000,
      source: 'vision',
      phase: 'playing',
      inFight: false,
      score: null,
      events: []
    })
  })

  it.each(['ROUND WON', 'ROUND LOST', 'VICTORY', 'DEFEAT'])('is a break on %s', (banner_text) => {
    expect(readAreas(reply({ banner_text }), 1000, NAMES).phase).toBe('intermission')
  })

  it('says what it read, for the log', () => {
    const read = readAreas(reply({ banner_text: 'SIEG' }), 1000, NAMES)
    expect(read.description).toContain('SIEG')
  })

  it.each([null, 'nonsense', 42, { feed_lines: 'x' }, { feed_lines: [null, 3, {}] }])(
    'makes nothing of a reply like %j',
    (raw) => {
      expect(readAreas(raw, 1000, NAMES).events).toEqual([])
    }
  )

  it('stops at a sensible number of events', () => {
    const lines = Array.from({ length: 20 }, (_, i) => line('TSCKEY', `Enemy${i}`))
    expect(readAreas(reply({ feed_lines: lines }), 1000, NAMES).events.length).toBeLessThanOrEqual(
      4
    )
  })
})

describe('the player’s names', () => {
  it('splits on commas and trims', () => {
    expect(parsePlayerNames(' TSCKEY , TscKey#EUW,,  ')).toEqual(['TSCKEY', 'TscKey#EUW'])
  })

  it('is empty when none is set', () => {
    expect(parsePlayerNames('')).toEqual([])
    expect(parsePlayerNames('   ')).toEqual([])
  })
})

// From the owner's real VALORANT screenshots: a teammate's row, which can carry the teammate's own
// kill-streak badge, above two of the owner's rows.
describe('a teammate’s kills and streak badge in the feed', () => {
  const teammateAboveOwnRows = reply({
    feed_lines: [line('Chamber IV', 'Jett'), line('TSCKey', 'Sova'), line('TSCKey', 'Omen')]
  })

  it('count only the player’s own rows', () => {
    const { events } = readAreas(teammateAboveOwnRows, 1000, NAMES)
    expect(events.map((e) => [e.type, e.opponent])).toEqual([
      ['kill', 'Sova'],
      ['kill', 'Omen']
    ])
  })

  it('never give the player a streak', async () => {
    const { MatchMemory } = await import('../src/main/companion/matchMemory')
    const memory = new MatchMemory()
    const derived = [
      ...memory.absorb(readAreas(teammateAboveOwnRows, 1000, NAMES)),
      ...memory.absorb(readAreas(reply({ feed_lines: [line('Chamber V', 'Sage')] }), 13_000, NAMES))
    ]
    expect(derived.map((e) => e.type)).not.toContain('kill_streak')
    expect(memory.context(13_000)).toMatchObject({ kills: 2, killStreak: 2 })
  })
})
