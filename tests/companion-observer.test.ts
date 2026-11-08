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
const image = {
  resize: () => ({ toBitmap: () => Buffer.alloc(64 * 4, (shade = (shade + 90) % 250)) })
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
