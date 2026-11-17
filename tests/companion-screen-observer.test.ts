import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SILKSONG_LAYOUT, type SilksongMeasure } from '../src/shared/screen/silksong'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-screen-observer-'))
vi.mock('electron', () => ({
  // The home folder is the test folder too, so a test can put a Player.log there.
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  screen: { getPrimaryDisplay: () => ({ id: 1 }) },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  desktopCapturer: {}
}))
vi.mock('koffi', () => ({ default: {} }))

// Only Minecraft's whole-screen look takes screenshots.
let shade = 0
const screenshots: number[] = []
const image = {
  getSize: () => ({ width: 1920, height: 1080 }),
  crop: () => image,
  resize: () => ({ toBitmap: () => Buffer.alloc(64 * 4, (shade = (shade + 90) % 250)) })
}
vi.mock('../src/main/windows/capture', () => ({
  captureDisplayImage: async (_display: number, width: number) => {
    screenshots.push(width)
    return image
  },
  toScreenshot: () => ({ base64: 'frame', width: 1, height: 1 })
}))
vi.mock('../src/main/system/foreground', () => ({ windowRect: () => null }))
vi.mock('../src/main/ai/assistant', () => ({ isAsking: () => false }))
vi.mock('../src/main/ai/engines', () => ({
  engineFor: () => ({ provider: 'builtin', model: 'test' }),
  engineReady: () => true
}))

const silksong = {
  id: 'silksong',
  name: 'Hollow Knight: Silksong',
  exes: [],
  watchFor: 'bosses',
  examples: ['a', 'b'] as [string, string]
}
const minecraft = { ...silksong, id: 'minecraft', name: 'Minecraft' }
let inFront: typeof silksong | null = silksong
vi.mock('../src/main/games/current', () => ({
  followForegroundGame: () => (inFront ? { game: inFront, program: { handle: 7n } } : null)
}))

// The stand-in for the live stream: the test sends measurements through its callback.
let onMeasure: ((m: SilksongMeasure, time: number) => void) | null = null
let watching = false
const REGION = Buffer.from('region')
const startScreenWatch = vi.fn(
  async (_game: unknown, _handle: bigint | null, measure: typeof onMeasure) => {
    watching = true
    onMeasure = measure
  }
)
const stopScreenWatch = vi.fn(() => {
  watching = false
  onMeasure = null
})
const grabRegion = vi.fn(async () => REGION)
vi.mock('../src/main/windows/screenWatch', () => ({
  startScreenWatch,
  stopScreenWatch,
  screenWatching: () => watching,
  grabRegion
}))

// The stand-in for text recognition: what it reads off each grabbed region.
let readAs: () => Promise<{ text: string }[]> = async () => []
const readText = vi.fn(async (png: Buffer) => {
  if (png !== REGION) return []
  const lines = await readAs()
  return lines.map((l) => ({ ...l, x: 0, y: 0, width: 10, height: 10 }))
})
vi.mock('../src/main/system/ocr', () => ({ readText, shutdownOcr: () => {} }))

// Rules the app ships switched off. Most tests here turn them on to check the rules themselves;
// the tests of the shipped behaviour put back the real values.
const switches = vi.hoisted(() => ({ inferBossDefeat: true, readPickups: true }))
vi.mock('../src/main/companion/silksongSwitches', () => ({
  get INFER_BOSS_DEFEAT() {
    return switches.inferBossDefeat
  },
  get READ_PICKUPS() {
    return switches.readPickups
  }
}))
const shipped = await vi.importActual<typeof import('../src/main/companion/silksongSwitches')>(
  '../src/main/companion/silksongSwitches'
)

interface Call {
  content: string
  images?: string[]
}
const looks: Call[] = []
const writes: Call[] = []
vi.mock('../src/main/ai/llm', () => ({
  complete: async (_engine: unknown, messages: Call[]) => {
    const message = messages[0]
    if (message.images?.length) {
      looks.push(message)
      return { content: '{"phase":"playing","events":[]}', toolCalls: [] }
    }
    writes.push(message)
    return { content: 'There she is', toolCalls: [] }
  }
}))

const settings = await import('../src/main/system/settings')
const observer = await import('../src/main/companion/observer')
const { screenPack } = await import('../src/main/games/catalog')

const toasts: string[] = []
let testClock = Date.parse('2026-11-17T12:00:00Z')

const NORMAL: SilksongMeasure = {
  brightness: 0.5,
  masks: 5,
  areaText: 0,
  bossText: 0,
  pickupText: 0
}

// Sends measurements four times a second, as the stream does.
function feed(m: Partial<SilksongMeasure>, frames: number): void {
  for (let i = 0; i < frames; i++) {
    if (!onMeasure) throw new Error('The screen is not being watched')
    onMeasure({ ...NORMAL, ...m }, Date.now())
    vi.advanceTimersByTime(250)
  }
}

// A title held on screen long enough to count, then gone.
function showText(region: 'areaText' | 'bossText' | 'pickupText'): void {
  feed({ [region]: 0.9 }, 4)
  feed({}, 1)
}

// A death as the screen shows it: down to the last mask, a 2 second fade, then the masks refill.
function die(): void {
  feed({ masks: 1 }, 2)
  feed({ brightness: 0.01, masks: 0 }, 8)
  feed({}, 2)
}

const settle = (): Promise<unknown> => vi.advanceTimersByTimeAsync(100)
const logged = (): string[] => observer.getObserverState().events.map((e) => e.type)

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime((testClock += 3_600_000))
  inFront = silksong
  readAs = async () => []
  switches.inferBossDefeat = true
  switches.readPickups = true
  settings.acceptTerms()
  observer.startObserver((text) => toasts.push(text))
  settings.updateSettings({ deviceConsent: true, companionMode: 'commentary', language: 'en' })
  observer.setPaused(false)
  await vi.advanceTimersByTimeAsync(0)
  observer.clearEvents()
  // The next tick starts watching again after the log was cleared.
  await vi.advanceTimersByTimeAsync(4_000)
  looks.length = 0
  writes.length = 0
  toasts.length = 0
  screenshots.length = 0
  startScreenWatch.mockClear()
  stopScreenWatch.mockClear()
  grabRegion.mockClear()
  readText.mockClear()
})

afterEach(() => {
  observer.stopObserver()
  vi.useRealTimers()
})

describe('which games are watched through the screen checks', () => {
  it('knows Silksong by its name, and no other game', () => {
    expect(screenPack(silksong)).toBe('silksong')
    expect(screenPack({ ...silksong, name: 'hollow knight: silksong' })).toBe('silksong')
    expect(screenPack({ ...silksong, name: 'Hollow Knight' })).toBeNull()
    expect(screenPack(minecraft)).toBeNull()
  })
})

describe('watching Silksong', () => {
  it('starts the screen watch once, not on every tick', async () => {
    expect(onMeasure).not.toBeNull()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(startScreenWatch).not.toHaveBeenCalled()
  })

  it('never asks the vision model about the screen', async () => {
    await vi.advanceTimersByTimeAsync(20_000)
    expect(looks).toHaveLength(0)
    expect(screenshots).toHaveLength(0)
  })

  it('turns a boss title read as "Moss Mother" into a logged encounter and a reaction', async () => {
    readAs = async () => [{ text: 'MOSS MOTHER' }]
    showText('bossText')
    await settle()
    expect(grabRegion).toHaveBeenCalledWith(SILKSONG_LAYOUT.bossTitle)
    expect(logged()).toEqual(['boss_encounter'])
    // The companion waits a moment in case more happens, then speaks on the next tick.
    await vi.advanceTimersByTimeAsync(4_000)
    expect(writes).toHaveLength(1)
    expect(writes[0].content).toContain('attempt 1')
    expect(writes[0].content).toContain('Moss Mother')
    expect(toasts).toEqual(['There she is'])
  })

  it('says nothing about a title it does not know', async () => {
    readAs = async () => [{ text: 'Press any button to continue' }]
    showText('bossText')
    showText('areaText')
    await settle()
    expect(logged()).toEqual([])
    expect(writes).toHaveLength(0)
  })

  it('survives text recognition failing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    readAs = async () => {
      throw new Error('the helper crashed')
    }
    showText('bossText')
    await settle()
    expect(logged()).toEqual([])
    feed({}, 4)
    error.mockRestore()
  })

  it('drops what is read if the log is cleared while it is being read', async () => {
    let finish: () => void = () => {}
    readAs = () => new Promise((resolve) => (finish = () => resolve([{ text: 'Moss Mother' }])))
    showText('bossText')
    await settle()
    expect(readText).toHaveBeenCalled()
    observer.clearEvents()
    finish()
    await settle()
    expect(logged()).toEqual([])
    expect(writes).toHaveLength(0)
  })

  it('reads an area title and says where a death happened', async () => {
    readAs = async () => [{ text: 'Moss Grotto' }]
    showText('areaText')
    await settle()
    expect(logged()).toEqual(['area_entered'])
    die()
    await settle()
    const death = observer.getObserverState().events.find((e) => e.type === 'death')
    expect(death?.description).toContain('Moss Grotto')
  })

  it('ties a death during a boss fight to that boss', async () => {
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    die()
    await settle()
    const death = observer.getObserverState().events.find((e) => e.type === 'death')
    expect(death?.description).toBe('died on attempt 1 at Moss Mother')
  })

  it('does not tie a death to a boss once a new area was entered', async () => {
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    readAs = async () => [{ text: 'Moss Grotto' }]
    showText('areaText')
    await settle()
    die()
    await settle()
    const death = observer.getObserverState().events.find((e) => e.type === 'death')
    expect(death?.description).toBe('died in Moss Grotto')
  })

  it('counts a boss as beaten from the first sighting, not a later one', async () => {
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    // The title shows again 13 seconds later with no death between: the same fight, so its
    // clock goes on.
    feed({}, 12 * 4)
    showText('bossText')
    await settle()
    feed({}, 7 * 4)
    // A short fade is a room change: more than 20 seconds after the encounter began.
    feed({ brightness: 0.01, masks: 0 }, 2)
    feed({}, 1)
    await settle()
    // The second sighting is no new attempt, and the fight is still won.
    expect(logged()).toEqual(['boss_encounter', 'fight_won'])
  })

  it('counts a quick retry after a death as a new attempt that can be won', async () => {
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    // The player dies (down to the last mask, a fade, a refill) and is back at the boss about 10
    // seconds after the first sighting: well within the 30 seconds a repeat used to be dropped for.
    die()
    feed({}, 18)
    showText('bossText')
    await settle()
    expect(logged().filter((t) => t === 'boss_encounter')).toHaveLength(2)
    // More than 20 seconds into the retry, a room change means it was beaten.
    feed({}, 21 * 4)
    feed({ brightness: 0.01, masks: 0 }, 2)
    feed({}, 1)
    await settle()
    const won = observer.getObserverState().events.find((e) => e.type === 'fight_won')
    expect(won?.description).toBe('left the arena of Moss Mother alive on attempt 2, likely beaten')
  })

  it('says nothing about a boss win with the shipped settings', async () => {
    switches.inferBossDefeat = shipped.INFER_BOSS_DEFEAT
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    feed({}, 21 * 4)
    feed({ brightness: 0.01, masks: 0 }, 2)
    feed({}, 1)
    await settle()
    expect(logged()).toEqual(['boss_encounter'])
  })

  it('counts the boss title after leaving the arena early as a new encounter', async () => {
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    // Out of the arena 5 seconds in: the fight is over, neither won nor lost.
    feed({}, 5 * 4)
    feed({ brightness: 0.01, masks: 0 }, 2)
    feed({}, 10 * 4)
    showText('bossText')
    await settle()
    expect(logged()).toEqual(['boss_encounter', 'boss_encounter'])
  })

  it('stops calling it an attempt at the boss once the player left the arena', async () => {
    switches.inferBossDefeat = shipped.INFER_BOSS_DEFEAT
    readAs = async () => [{ text: 'Moss Mother' }]
    showText('bossText')
    await settle()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(writes.at(-1)?.content).toContain('This is attempt 1 at Moss Mother')
    // A long fight, then a room change: the fight is over, with no word on how.
    feed({}, 21 * 4)
    feed({ brightness: 0.01, masks: 0 }, 2)
    feed({}, 1)
    await settle()
    const said = writes.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(writes).toHaveLength(said)
    feed({ masks: 3 }, 2)
    feed({ masks: 1 }, 2)
    await settle()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(logged()).toEqual(['boss_encounter', 'low_health'])
    // The low-health comment (a repeated reply is asked for again, so there may be two tries).
    const fresh = writes.slice(said)
    expect(fresh.length).toBeGreaterThan(0)
    for (const write of fresh) expect(write.content).not.toContain('This is attempt')
  })

  it('takes a dark stretch with full masks for no death', async () => {
    feed({}, 2)
    feed({ brightness: 0.01, masks: 0 }, 8)
    feed({}, 8)
    await settle()
    expect(logged()).toEqual([])
  })

  it('comments on a low-health moment', async () => {
    feed({ masks: 3 }, 2)
    feed({ masks: 1 }, 2)
    await settle()
    expect(logged()).toContain('low_health')
  })

  it('reads no pickup text and logs nothing with the shipped settings', async () => {
    switches.readPickups = shipped.READ_PICKUPS
    readAs = async () => [{ text: 'Silk Spool' }]
    showText('pickupText')
    await settle()
    expect(grabRegion).not.toHaveBeenCalled()
    expect(readText).not.toHaveBeenCalled()
    expect(logged()).toEqual([])
  })

  it('logs a pickup once, and only text that looks like a name', async () => {
    readAs = async () => [{ text: 'Silk Spool' }]
    showText('pickupText')
    await settle()
    feed({}, 10)
    vi.advanceTimersByTime(120_000)
    showText('pickupText')
    await settle()
    readAs = async () => [{ text: '12345' }]
    feed({}, 10)
    showText('pickupText')
    await settle()
    const events = observer.getObserverState().events
    expect(events.map((e) => [e.type, e.description])).toEqual([['milestone', 'Silk Spool']])
  })

  it('stops watching when the game leaves the foreground', async () => {
    inFront = null
    await vi.advanceTimersByTimeAsync(4_000)
    expect(stopScreenWatch).toHaveBeenCalled()
    expect(observer.getObserverState().status).toBe('waiting-for-game')
  })

  it('stops watching when paused', () => {
    observer.setPaused(true)
    expect(stopScreenWatch).toHaveBeenCalled()
  })

  it('stops watching when the companion is turned off', () => {
    settings.updateSettings({ companionMode: 'on-demand' })
    expect(stopScreenWatch).toHaveBeenCalled()
  })

  it('tells the player when the capture stays black', async () => {
    feed({ brightness: 0, masks: 0 }, 40)
    expect(observer.getObserverState().status).toBe('blocked-by-fullscreen')
    // The next tick does not hide it again.
    await vi.advanceTimersByTimeAsync(4_000)
    expect(observer.getObserverState().status).toBe('blocked-by-fullscreen')
    // The game shows again.
    feed({}, 1)
    expect(observer.getObserverState().status).toBe('watching')
  })

  it('reads text in the language the game is set to', async () => {
    const folder = join(userData, 'AppData', 'LocalLow', 'Team Cherry', 'Hollow Knight Silksong')
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      join(folder, 'Player.log'),
      "Loaded saved language code 'EN'\nsomething else\nLoaded saved language code 'DE'\n"
    )
    try {
      // A new watch reads the language again.
      observer.clearEvents()
      await vi.advanceTimersByTimeAsync(4_000)
      readAs = async () => [{ text: 'Moosmutter' }]
      showText('bossText')
      await settle()
      expect(readText).toHaveBeenCalledWith(REGION, 'de')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('warms up text recognition when the watch starts', async () => {
    observer.clearEvents()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(readText).toHaveBeenCalledWith(expect.any(Buffer), 'en')
    expect(readText.mock.calls.some(([png]) => png !== REGION)).toBe(true)
  })
})

describe('the game language in Player.log', () => {
  it('is the newest saved language, in lower case', () => {
    expect(
      observer.silksongLanguage(
        "Loaded saved language code 'EN'\nLoaded saved language code 'DE'\nother line"
      )
    ).toBe('de')
  })

  it('is English when the log names none', () => {
    expect(observer.silksongLanguage('')).toBe('en')
    expect(observer.silksongLanguage('Initialize engine version: 6000.0')).toBe('en')
  })
})

describe('other games', () => {
  it('still look at the whole screen in Minecraft', async () => {
    inFront = minecraft
    await vi.advanceTimersByTimeAsync(20_000)
    expect(looks.length).toBeGreaterThan(0)
    expect(looks[0].images).toHaveLength(1)
    expect(startScreenWatch).not.toHaveBeenCalled()
    expect(stopScreenWatch).toHaveBeenCalled()
  })
})
