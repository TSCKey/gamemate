import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-companion-observer-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  screen: { getPrimaryDisplay: () => ({ id: 1 }) },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  desktopCapturer: {}
}))
vi.mock('koffi', () => ({ default: {} }))

// A screen that looks different every time, so each tick may look at it.
let shade = 0
let frozen = false
const cuts: { x: number; y: number; width: number; height: number }[] = []
const image = {
  getSize: () => ({ width: 1920, height: 1080 }),
  crop: (box: (typeof cuts)[number]) => {
    cuts.push(box)
    return image
  },
  resize: () => ({
    toBitmap: () => Buffer.alloc(64 * 4, frozen ? shade : (shade = (shade + 90) % 250))
  })
}
vi.mock('../src/main/windows/capture', () => ({
  captureDisplayImage: async () => image,
  toScreenshot: () => ({ base64: 'frame', width: 1, height: 1 })
}))
vi.mock('../src/main/system/foreground', () => ({ windowRect: () => null }))
vi.mock('../src/main/ai/assistant', () => ({ isAsking: () => false }))
vi.mock('../src/main/ai/engines', () => ({
  engineFor: () => ({ provider: 'builtin', model: 'test' }),
  engineReady: () => true
}))
const game = {
  id: 'valorant',
  name: 'VALORANT',
  exes: [],
  competitive: true,
  watchFor: 'the spike being planted',
  examples: ['a', 'b'] as [string, string]
}
vi.mock('../src/main/games/current', () => ({
  followForegroundGame: () => ({ game, program: { handle: 1 } })
}))

// The stand-in AI: looks at the frame (has images) or writes the reaction (no images).
interface Call {
  content: string
  images?: string[]
}
const looks: Call[] = []
const writes: Call[] = []
let lookReply = ''
let holdLook: Promise<void> | null = null
vi.mock('../src/main/ai/llm', () => ({
  complete: async (_engine: unknown, messages: Call[]) => {
    const message = messages[0]
    if (message.images?.length) {
      looks.push(message)
      if (holdLook) await holdLook
      return { content: lookReply, toolCalls: [] }
    }
    writes.push(message)
    return { content: 'What a finish to that one', toolCalls: [] }
  }
}))

const settings = await import('../src/main/system/settings')
const observer = await import('../src/main/companion/observer')

const sawVictory = JSON.stringify({
  feed_lines: [],
  banner_text: 'VICTORY',
  banner_kind: 'victory',
  banner_name: '',
  phase: 'intermission',
  in_fight: false,
  own_score: 13,
  enemy_score: 9,
  description: 'A victory screen.',
  events: [
    {
      type: 'victory',
      sure: true,
      importance: 10,
      detail: 'VICTORY',
      opponent: '',
      place: '',
      count: 1
    }
  ]
})
const sawNothing = JSON.stringify({
  feed_lines: [],
  banner_text: '',
  banner_kind: 'none',
  banner_name: '',
  phase: 'playing',
  in_fight: false,
  own_score: -1,
  enemy_score: -1,
  description: 'Normal play.',
  events: []
})

const toasts: string[] = []
// The observer remembers when it last looked, so time has to keep moving forward between tests.
let testClock = Date.parse('2026-11-08T12:00:00Z')

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime((testClock += 3_600_000))
  holdLook = null
  lookReply = sawNothing
  settings.acceptTerms()
  observer.startObserver((text) => toasts.push(text))
  settings.updateSettings({ deviceConsent: true, companionMode: 'commentary', language: 'en' })
  observer.setPaused(false)
  // Lets the look that changing the settings started finish before the test begins.
  await vi.advanceTimersByTimeAsync(0)
  observer.clearEvents()
  looks.length = 0
  writes.length = 0
  toasts.length = 0
})

afterEach(() => {
  observer.stopObserver()
  vi.useRealTimers()
})

// Long enough for the next look: the wait between looks is 12 seconds by default.
const nextLook = (): Promise<void> => vi.advanceTimersByTimeAsync(20_000).then(() => undefined)

describe('watching a match in Commentary mode', () => {
  it('reads the screen for facts only, then writes the reaction separately', async () => {
    lookReply = sawVictory
    await nextLook()
    expect(looks.length).toBeGreaterThan(0)
    expect(looks[0].content).not.toMatch(/"comment"/)
    expect(writes).toHaveLength(1)
    expect(writes[0].images).toBeUndefined()
    expect(toasts).toEqual(['What a finish to that one'])
  })

  it('makes no second AI call when nothing happened', async () => {
    await nextLook()
    expect(looks.length).toBeGreaterThan(0)
    expect(writes).toHaveLength(0)
  })

  it('shows what was seen in the log and marks what was said', async () => {
    lookReply = sawVictory
    await nextLook()
    const [event] = observer.getObserverState().events
    expect(event).toMatchObject({
      type: 'victory',
      description: 'VICTORY',
      spoken: true,
      comment: 'What a finish to that one'
    })
  })

  it('still answers questions from what it saw', async () => {
    lookReply = sawVictory
    await nextLook()
    expect(observer.recentObservations().join()).toContain('VICTORY')
  })

  it('gives answers a kill-feed reading as fact: the model only copied the text', async () => {
    lookReply = sawVictory
    await nextLook()
    expect(observer.recentObservations().join()).not.toContain('likely')
  })

  it('survives a reply that is not JSON', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    lookReply = 'not json at all'
    await nextLook()
    expect(toasts).toEqual([])
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('the other companion modes', () => {
  it('keeps a log without comments in Observation mode', async () => {
    settings.updateSettings({ companionMode: 'observation' })
    lookReply = sawVictory
    await nextLook()
    expect(writes).toHaveLength(0)
    expect(toasts).toEqual([])
    expect(observer.getObserverState().events).toHaveLength(1)
  })

  it('never writes comments in Quiet mode', async () => {
    settings.updateSettings({ companionMode: 'quiet' })
    lookReply = sawVictory
    await nextLook()
    expect(writes).toHaveLength(0)
  })

  it('stops looking when turned off', async () => {
    settings.updateSettings({ companionMode: 'on-demand' })
    await nextLook()
    expect(looks).toHaveLength(0)
    expect(observer.getObserverState().status).toBe('off')
  })
})

describe('forgetting', () => {
  it('drops what a look finds if the companion was turned off meanwhile', async () => {
    let finish: () => void = () => {}
    holdLook = new Promise((resolve) => (finish = resolve))
    lookReply = sawVictory
    await vi.advanceTimersByTimeAsync(20_000)
    expect(looks.length).toBeGreaterThan(0)
    settings.updateSettings({ companionMode: 'on-demand' })
    finish()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(observer.getObserverState().events).toEqual([])
    expect(toasts).toEqual([])
  })

  it('forgets the match when the log is cleared', async () => {
    lookReply = sawVictory
    await nextLook()
    observer.clearEvents()
    expect(observer.matchContext().kills).toBe(0)
    expect(observer.getObserverState().events).toEqual([])
  })
})

describe('watching only the parts of the screen that show the match', () => {
  const sawLine = (left: string, right: string): string =>
    JSON.stringify({
      feed_lines: [{ left, right }],
      banner_text: '',
      banner_kind: 'none',
      banner_name: ''
    })

  beforeEach(() => {
    cuts.length = 0
    frozen = false
    game.name = 'VALORANT'
  })

  afterEach(() => {
    frozen = false
    game.name = 'VALORANT'
  })

  it('shows the model those parts and nothing else', async () => {
    looks.length = 0
    await nextLook()
    expect(looks[0].images?.length).toBeGreaterThan(1)
    expect(cuts.length).toBeGreaterThan(1)
    for (const cut of cuts) expect(cut.width * cut.height).toBeLessThan(0.25 * 1920 * 1080)
  })

  it('looks again within a few seconds, so a feed line is not missed', async () => {
    await nextLook()
    const before = looks.length
    await vi.advanceTimersByTimeAsync(4_000)
    expect(looks.length).toBeGreaterThan(before)
  })

  it('leaves the model alone while those parts do not change', async () => {
    await nextLook()
    frozen = true
    await vi.advanceTimersByTimeAsync(5_000)
    const before = looks.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(looks.length).toBe(before)
  })

  it('still looks once in a while when nothing changes', async () => {
    await nextLook()
    frozen = true
    await vi.advanceTimersByTimeAsync(5_000)
    const before = looks.length
    await vi.advanceTimersByTimeAsync(70_000)
    expect(looks.length).toBeGreaterThan(before)
  })

  it('counts the player’s own line in the feed', async () => {
    settings.updateSettings({ commentaryPlayerNames: 'TSCKEY' })
    lookReply = sawLine('TSCKEY', 'Sova')
    await nextLook()
    expect(observer.matchContext().kills).toBe(1)
  })

  it('leaves out other players’ lines', async () => {
    settings.updateSettings({ commentaryPlayerNames: 'TSCKEY' })
    lookReply = sawLine('Raze', 'Omen')
    await nextLook()
    expect(observer.matchContext().kills).toBe(0)
  })

  it('still reads banners when it does not know the player’s name', async () => {
    settings.updateSettings({ commentaryPlayerNames: '' })
    lookReply = sawVictory
    await nextLook()
    expect(writes.length).toBeGreaterThan(0)
  })

  it('asks the model only to copy what is written', () => {
    const prompt = observer.areaPrompt([
      { kind: 'feed', x: 0.7, y: 0, width: 0.3, height: 0.3 },
      { kind: 'banner', x: 0.25, y: 0.1, width: 0.5, height: 0.2 }
    ])
    expect(prompt).toMatch(/copy only what is written/i)
    expect(prompt).toMatch(/Image 1.*feed/)
    expect(prompt).toMatch(/Image 2.*banner/)
  })

  it('never tells the model the player’s name', () => {
    settings.updateSettings({ commentaryPlayerNames: 'TSCKEY' })
    const prompt = observer.areaPrompt([{ kind: 'feed', x: 0.7, y: 0, width: 0.3, height: 0.3 }])
    expect(prompt).not.toContain('TSCKEY')
  })

  it('constrains the reply to text and a fixed list of banners', () => {
    const schema = observer.areaSchema() as {
      properties: Record<string, { enum?: string[] }>
    }
    expect(Object.keys(schema.properties)).toEqual([
      'feed_lines',
      'banner_text',
      'banner_kind',
      'banner_name'
    ])
    expect(schema.properties.banner_kind.enum).toContain('none')
    expect(schema.properties.banner_kind.enum).not.toContain('victory')
    expect(schema.properties.banner_kind.enum).not.toContain('round_won')
  })

  it('offers only reactions, never advice, in those games', () => {
    const on = { ...settings.getSettings(), commentaryTactics: true }
    expect(observer.commentaryOptions(on, game).tactics).toBe(false)
    expect(observer.commentaryOptions(on, { ...game, name: 'Terraria' }).tactics).toBe(true)
  })

  it('keeps looking at the whole screen in games without a known layout', async () => {
    game.name = 'Terraria'
    looks.length = 0
    await nextLook()
    expect(looks[0].images).toHaveLength(1)
    expect(cuts).toHaveLength(0)
  })
})

describe('what the model is asked', () => {
  it('names the game, what to watch for and only event types for this game', () => {
    const prompt = observer.analysisPrompt('The scene changed.', game)
    expect(prompt).toContain('VALORANT')
    expect(prompt).toContain('the spike being planted')
    expect(prompt).toContain('- bomb_planted:')
    expect(prompt).not.toContain('- hostile_mob:')
  })

  it('tells it not to take other players’ kills for the player’s own', () => {
    expect(observer.analysisPrompt('x', game)).toMatch(/kill.feed line between other players/i)
  })

  it('tells a kill banner apart from the player being killed', () => {
    const prompt = observer.analysisPrompt('x', game)
    expect(prompt).toMatch(/"ELIMINATED <name>".*the player eliminated that enemy/)
    expect(prompt).toMatch(/"KILLED BY <name>".*the player was eliminated/)
  })

  it('always reports a result screen', () => {
    expect(observer.analysisPrompt('x', game)).toMatch(/result screen .*is always an event/i)
  })

  it('tells it that badges on a kill-feed line belong to whoever made that kill', () => {
    expect(observer.analysisPrompt('x', game)).toMatch(
      /Badges, icons and numbers on a kill-feed line belong to whoever made that kill/
    )
  })

  it('tells it to report only what is visible', () => {
    expect(observer.analysisPrompt('x', game)).toMatch(/only what is visible/i)
  })

  it('constrains the reply to this game’s event types', () => {
    const schema = observer.analysisSchema(game) as {
      properties: { events: { items: { properties: { type: { enum: string[] } } } } }
    }
    const types = schema.properties.events.items.properties.type.enum
    expect(types).toContain('kill')
    expect(types).not.toContain('hostile_mob')
    expect(types).not.toContain('comeback')
  })
})
