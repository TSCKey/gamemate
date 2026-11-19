// What the companion leaves unsaid in a screen-read game: places the player comes back to, and
// the everyday "last mask" outside boss fights. From the owner's play test of 2026-11-19, where
// eight of nine comments were the same close call or getting back above it.
import { describe, expect, it } from 'vitest'
import { runRule } from '../src/main/geis/correlation'
import { newAreaAfterDeaths } from '../src/main/geis/rules/newAreaAfterDeaths'
import { Commentator, type CommentaryOptions } from '../src/main/companion/commentator'
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
const revisit = (place: string, time: number): GameEvent =>
  seen('area_entered', time, { place, detail: `back in ${place}`, data: { revisit: true } })

const game = { id: 'silksong', name: 'Hollow Knight: Silksong', competitive: false }
const options: CommentaryOptions = {
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
  game
}

// Plays a script of screen events, giving the companion a chance to speak every 4 s like the
// observer does. Returns what was spoken for, with the second it was said.
async function play(script: GameEvent[], until: number): Promise<string[]> {
  let clock = 0
  // Every line different, so none is held back as a repeat.
  const replies = [
    'Careful there.',
    'Wow, what a moment!',
    'Steady hands now.',
    'Okay, deep breath.',
    'That was something.',
    'Keep it going!',
    'Not bad at all.',
    'Here we go again.',
    'Just like that.'
  ]
  const spoken: string[] = []
  const commentator = new Commentator({
    now: () => clock,
    generate: async () => replies.shift() ?? '',
    deliver: (_text, events) => spoken.push(`${clock / S}s ${events.map((e) => e.type).join('+')}`)
  })
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
  let next = 0
  for (let s = 0; s <= until; s++) {
    clock = s * S
    while (next < script.length && script[next].time <= clock) {
      commentator.observe(report(script[next].time, [script[next]]), game)
      next++
    }
    if (s % 4 === 0) await commentator.speakIfDue(options)
  }
  return spoken
}

describe('places the player comes back to', () => {
  it('are remembered but not spoken about', async () => {
    const spoken = await play([revisit('Marrow', 10 * S)], 60)
    expect(spoken).toEqual([])
  })

  it('still get a word when the place is new', async () => {
    const spoken = await play([seen('area_entered', 10 * S, { place: 'Marrow' })], 60)
    expect(spoken).toEqual(['16s area_entered'])
  })

  it('never count as getting somewhere new after dying', () => {
    const deaths = [1, 2, 3].map((t) => seen('death', t * S, { place: 'Marrow' }))
    expect(runRule(newAreaAfterDeaths, [...deaths, revisit('Bone Bottom', 10 * S)])).toEqual([])
    const reached = runRule(newAreaAfterDeaths, [
      ...deaths,
      seen('area_entered', 10 * S, { place: 'Bone Bottom' })
    ])
    expect(reached.map((e) => e.type)).toEqual(['new_area_after_deaths'])
  })
})

describe('close calls outside a boss fight', () => {
  it('get a word at most every five minutes, and getting back above the last mask none', async () => {
    // The owner's play test, seconds as logged (Marrow and Bone Bottom were revisits).
    const script = [
      seen('low_health', 12 * S),
      seen('recovery', 47 * S),
      revisit('Marrow', 54 * S),
      seen('low_health', 184 * S),
      seen('recovery', 193 * S),
      seen('low_health', 197 * S),
      seen('recovery', 242 * S),
      seen('low_health', 295 * S),
      seen('recovery', 302 * S),
      seen('low_health', 426 * S),
      seen('recovery', 500 * S),
      revisit('Bone Bottom', 739 * S),
      seen('low_health', 758 * S)
    ]
    // Was nine comments; now three, five minutes or more apart.
    expect(await play(script, 800)).toEqual([
      '12s low_health',
      '428s low_health',
      '760s low_health'
    ])
  })

  it('are still big moments against a boss', async () => {
    const script = [
      seen('boss_encounter', 0, { opponent: 'Last Judge' }),
      seen('low_health', 60 * S),
      seen('death', 70 * S, { opponent: 'Last Judge' }),
      seen('boss_encounter', 100 * S, { opponent: 'Last Judge' }),
      seen('low_health', 220 * S)
    ]
    const spoken = await play(script, 260)
    expect(spoken.filter((s) => s.includes('low_health'))).toHaveLength(2)
  })
})
