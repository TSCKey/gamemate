import { describe, expect, it } from 'vitest'
import {
  EVENT_RULES,
  normalizeVisionReport,
  visionEventTypes,
  type VisionGame
} from '../src/main/companion/events'
import { EVENT_TYPES } from '../src/shared/types'

const seen = (over: Record<string, unknown>): Record<string, unknown> => ({
  type: 'kill',
  sure: true,
  importance: 7,
  detail: 'ELIMINATED banner',
  opponent: '',
  place: '',
  count: 1,
  ...over
})
const report = (over: Record<string, unknown>): Record<string, unknown> => ({
  phase: 'playing',
  in_fight: false,
  own_score: -1,
  enemy_score: -1,
  description: 'A shooter match.',
  events: [],
  ...over
})

describe('reading what the model saw into the common event format', () => {
  it('keeps a clearly seen event with its capture time and source', () => {
    const out = normalizeVisionReport(report({ events: [seen({ opponent: 'Sova' })] }), 5000)
    expect(out.time).toBe(5000)
    expect(out.source).toBe('vision')
    expect(out.events).toHaveLength(1)
    expect(out.events[0]).toMatchObject({
      type: 'kill',
      category: 'combat',
      time: 5000,
      source: 'vision',
      opponent: 'Sova',
      detail: 'ELIMINATED banner'
    })
  })

  it('throws away events the model was not sure about', () => {
    const out = normalizeVisionReport(report({ events: [seen({ sure: false })] }), 1)
    expect(out.events).toEqual([])
  })

  it('throws away event types it does not know, and "none"', () => {
    const out = normalizeVisionReport(
      report({ events: [seen({ type: 'dance_party' }), seen({ type: 'none' })] }),
      1
    )
    expect(out.events).toEqual([])
  })

  it('ignores everything on a menu or loading screen', () => {
    const out = normalizeVisionReport(
      report({ phase: 'menu', own_score: 3, enemy_score: 1, events: [seen({ type: 'victory' })] }),
      1
    )
    expect(out.events).toEqual([])
    expect(out.score).toBeNull()
  })

  it('keeps a visible score and treats -1 as unknown', () => {
    expect(normalizeVisionReport(report({ own_score: 7, enemy_score: 4 }), 1).score).toEqual({
      own: 7,
      enemy: 4
    })
    expect(normalizeVisionReport(report({ own_score: 7, enemy_score: -1 }), 1).score).toBeNull()
  })

  it('survives replies with missing or nonsense fields', () => {
    for (const raw of [null, 'text', 42, {}, { events: 'many' }, { events: [null, 3, {}] }]) {
      const out = normalizeVisionReport(raw, 9)
      expect(out.events).toEqual([])
      expect(out.score).toBeNull()
      expect(out.inFight).toBe(false)
      expect(out.phase).toBe('playing')
    }
  })

  it('reports at most a few events per look', () => {
    const many = Array.from({ length: 12 }, (_, i) => seen({ opponent: `P${i}` }))
    expect(normalizeVisionReport(report({ events: many }), 1).events.length).toBeLessThanOrEqual(4)
  })

  it('clamps importance and count to sane ranges', () => {
    const [event] = normalizeVisionReport(
      report({ events: [seen({ importance: 99, count: 500 })] }),
      1
    ).events
    expect(event.importance).toBe(10)
    expect(event.count).toBeLessThanOrEqual(10)
  })

  it('treats placeholder names as no name at all', () => {
    for (const opponent of ['unknown', 'N/A', 'none', 'enemy', 'the player', '  ']) {
      const [event] = normalizeVisionReport(report({ events: [seen({ opponent })] }), 1).events
      expect(event.opponent).toBe('')
    }
  })

  it('removes line breaks and shortens text read off the screen', () => {
    const [event] = normalizeVisionReport(
      report({
        events: [
          seen({ opponent: `Bad\nName ${'x'.repeat(200)}`, detail: `a\r\nb${'y'.repeat(400)}` })
        ]
      }),
      1
    ).events
    expect(event.opponent).not.toMatch(/[\r\n]/)
    expect(event.opponent.length).toBeLessThanOrEqual(32)
    expect(event.detail).not.toMatch(/[\r\n]/)
    expect(event.detail.length).toBeLessThanOrEqual(140)
  })
})

describe('fixing kills and deaths the model mixed up, from the text it quoted', () => {
  const read = (type: string, detail: string, opponent: string): string =>
    normalizeVisionReport(report({ events: [seen({ type, detail, opponent })] }), 1).events[0].type

  it('makes a kill of an "ELIMINATED <name>" banner reported as a death', () => {
    expect(read('death', "The player died to Sova, 'ELIMINATED Sova' banner", 'Sova')).toBe('kill')
    expect(read('death', 'ELIMINATED  SOVA', 'Sova')).toBe('kill')
  })

  it('makes a death of a "KILLED BY <name>" screen reported as a kill', () => {
    expect(read('kill', 'KILLED BY Reyna', 'Reyna')).toBe('death')
    expect(read('kill', 'Eliminated by Reyna', 'Reyna')).toBe('death')
  })

  it('leaves correct reports alone', () => {
    expect(read('death', 'KILLED BY Reyna', 'Reyna')).toBe('death')
    expect(read('kill', 'ELIMINATED Sova', 'Sova')).toBe('kill')
    expect(read('death', 'You died', '')).toBe('death')
  })

  it('leaves a name that is only mentioned alone', () => {
    expect(read('death', 'Sova was nearby when the player fell', 'Sova')).toBe('death')
  })

  it('treats a name read off the screen as text, not a pattern', () => {
    expect(read('death', 'KILLED BY a.b(c', 'a.b(c')).toBe('death')
  })
})

describe('the event table', () => {
  it('covers every event type', () => {
    for (const type of EVENT_TYPES) {
      if (type !== 'none') expect(EVENT_RULES[type], type).toBeDefined()
    }
  })
})

describe('what the model is asked to look for', () => {
  const minecraft: VisionGame = { id: 'minecraft', name: 'Minecraft', competitive: false }
  const valorant: VisionGame = { id: 'v', name: 'VALORANT', competitive: true }
  const other: VisionGame = { id: 'h', name: 'Hades', competitive: false }

  it('keeps Minecraft to survival events', () => {
    const types = visionEventTypes(minecraft)
    expect(types).toEqual(
      expect.arrayContaining(['death', 'low_health', 'hostile_mob', 'dark_area'])
    )
    expect(types).not.toContain('bomb_planted')
    expect(types).not.toContain('round_won')
  })

  it('asks competitive games for match events but no enemy call-outs', () => {
    const types = visionEventTypes(valorant)
    expect(types).toEqual(
      expect.arrayContaining(['kill', 'assist', 'round_won', 'bomb_planted', 'victory', 'defeat'])
    )
    expect(types).not.toContain('hostile_mob')
    expect(types).not.toContain('dark_area')
  })

  it('never asks for streaks or headshots, which a teammate’s feed line can carry too', () => {
    for (const game of [valorant, other]) {
      const types = visionEventTypes(game)
      expect(types).not.toContain('kill_streak')
      expect(types).not.toContain('headshot')
    }
  })

  it('throws away a streak or headshot the model reports anyway', () => {
    const out = normalizeVisionReport(
      report({ events: [seen({ type: 'kill_streak', count: 4 }), seen({ type: 'headshot' })] }),
      1
    )
    expect(out.events).toEqual([])
  })

  it('asks for multikills only from a banner, never from a kill-feed line', () => {
    expect(EVENT_RULES.multikill.seen).toMatch(/never a badge on a kill-feed line/)
  })

  it('never asks a model for what only match memory can work out', () => {
    for (const game of [minecraft, valorant, other]) {
      const types = visionEventTypes(game)
      for (const derived of ['comeback', 'win_streak', 'loss_streak', 'recovery']) {
        expect(types).not.toContain(derived)
      }
    }
  })
})
