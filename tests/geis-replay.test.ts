// Replays the owner's Silksong recordings through the real adapter, engine, rules and Director.
// The fixtures hold only what the live watch measures per frame (4 a second) and the title text
// that matched a known name, made from the recordings by a local script; no frames or pictures.
import { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it, vi } from 'vitest'
import type { SilksongMeasure } from '../src/shared/screen/silksong'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  screen: { getPrimaryDisplay: () => ({ id: 1 }) },
  desktopCapturer: {},
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))
vi.mock('koffi', () => ({ default: {} }))
vi.mock('../src/main/system/foreground', () => ({ windowRect: () => null }))

interface Fixture {
  name: string
  stepMs: number
  titles: { at: number; region: 'area' | 'boss'; text: string }[]
  // [time ms, brightness, masks, area text, boss text, pickup text]
  frames: [number, number, number, number, number, number][]
}

// The frame being fed, so a region grabbed for a title is that frame's.
const replay = vi.hoisted(() => ({
  time: 0,
  fixture: null as null | {
    titles: { at: number; region: 'area' | 'boss'; text: string }[]
  },
  onMeasure: null as null | ((m: SilksongMeasure, time: number) => void)
}))

vi.mock('../src/main/windows/screenWatch', () => ({
  startScreenWatch: async (
    _game: unknown,
    _handle: unknown,
    measure: (m: SilksongMeasure, time: number) => void
  ) => {
    replay.onMeasure = measure
  },
  stopScreenWatch: () => {
    replay.onMeasure = null
  },
  screenWatching: () => replay.onMeasure !== null,
  grabRegion: async (box: { y: number }) =>
    Buffer.from(JSON.stringify({ at: replay.time, region: box.y >= 0.7 ? 'boss' : 'area' }))
}))

vi.mock('../src/main/system/ocr', () => ({
  shutdownOcr: () => {},
  readText: async (png: Buffer) => {
    if (png.length < 10) return []
    const { at, region } = JSON.parse(png.toString())
    const title = replay.fixture?.titles.find((t) => t.at === at && t.region === region)
    return title?.text ? [{ text: title.text, x: 0, y: 0, width: 1, height: 1 }] : []
  }
}))

await import('../src/main/system/settings')
const { createSilksong } = await import('../src/main/geis/adapters/silksong')
const { Commentator } = await import('../src/main/companion/commentator')
type Host = import('../src/main/geis/adapter').AdapterHost
type Options = import('../src/main/companion/commentator').CommentaryOptions

const GAME = {
  id: 'silksong',
  name: 'Hollow Knight: Silksong',
  exes: [],
  watchFor: 'bosses',
  examples: ['a', 'b'] as [string, string]
}

const load = (name: string): Fixture =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'replay', `${name}.json`), 'utf8'))

interface Result {
  events: string[]
  spoken: string[][]
  history: { type: string; basis: string; commentary: string }[]
}

async function play(name: string): Promise<Result> {
  const fixture = load(name)
  replay.fixture = fixture
  vi.spyOn(console, 'info').mockImplementation(() => {})
  let clock = 0
  let lines = 0
  const spoken: string[][] = []
  const commentator = new Commentator({
    now: () => clock,
    // A different line every time, so the repeat check never gets in the way.
    generate: async () => `line ${++lines} ${'abcdefghij'.slice(lines % 10)}`,
    deliver: (_text, events) => spoken.push(events.map((e) => e.type))
  })
  const options: Options = {
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
    game: { id: GAME.id, name: GAME.name, competitive: false }
  }
  const events: string[] = []
  let adapter: ReturnType<typeof createSilksong> | null = null
  const host: Host = {
    observe: (report) => {
      const checks = new Set(adapter?.checks)
      const fresh = commentator.observe(report, options.game, checks)
      for (const e of fresh) events.push(`${Math.round(e.time / 1000)}s ${e.type}: ${e.detail}`)
      return fresh
    },
    speakIfDue: async () => {
      await commentator.speakIfDue(options)
    },
    showCommentsOn: () => {},
    setState: () => {},
    status: () => 'watching',
    recentEvents: () => [],
    inFight: () => commentator.isInFight(),
    forgets: () => 0
  }
  adapter = createSilksong(host)
  const settings = (await import('../src/main/system/settings')).getSettings()
  await adapter.watch(settings, GAME, 7n)
  for (const [t, brightness, masks, areaText, bossText, pickupText] of fixture.frames) {
    clock = t
    replay.time = t
    replay.onMeasure?.({ brightness, masks, areaText, bossText, pickupText }, t)
    // Lets the title reads and comments finish, as they would between frames.
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve))
    if (t % 1000 === 0) await commentator.speakIfDue(options)
  }
  adapter.stop()
  vi.mocked(console.info).mockRestore()
  return {
    events,
    spoken,
    history: commentator.history().map((e) => ({
      type: e.type,
      basis: e.basis,
      commentary: e.commentary
    }))
  }
}

describe("replaying the owner's Silksong recordings", () => {
  it('finds the Last Judge fight, the close call and the death in the first clip', async () => {
    const result = await play('silksong-1')
    expect(result.events).toEqual([
      '10s boss_encounter: facing Last Judge',
      '26s low_health: down to the last mask',
      '30s death: died on attempt 1 at Last Judge'
    ])
    expect(result.spoken[0]).toEqual(['boss_encounter'])
  })

  it('invents nothing in the clips with only ordinary play', async () => {
    for (const name of ['silksong-2', 'silksong-3']) {
      const result = await play(name)
      expect(result.events, name).toEqual([])
      expect(result.spoken, name).toEqual([])
    }
  })

  it('follows the long session: one close call and four areas, and no death from a hidden HUD', async () => {
    const result = await play('silksong-4')
    expect(result.events).toEqual([
      '351s low_health: down to the last mask',
      '378s area_entered: entered Citadel of Song',
      '391s recovery: back above one mask after a close call',
      '402s area_entered: entered Blasted Steps',
      '657s area_entered: entered Bone Bottom',
      '690s area_entered: entered Marrow'
    ])
  })

  it('keeps every event it found verified, and never more than it saw', async () => {
    for (const name of ['silksong-1', 'silksong-4']) {
      const { history } = await play(name)
      expect(
        history.every((e) => e.basis === 'verified'),
        name
      ).toBe(true)
    }
  })
})
