import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProfile } from '../src/main/games/catalog'
import type { SilksongMeasure } from '../src/shared/screen/silksong'

// A stand-in for Electron's window: records what GameMate sends to its page.
class FakeWindow {
  static all: FakeWindow[] = []
  sent: unknown[][] = []
  visible = false
  destroyed = false
  webContents = { send: (...args: unknown[]) => this.sent.push(args) }
  constructor() {
    FakeWindow.all.push(this)
  }
  setAlwaysOnTop = vi.fn()
  setContentProtection = vi.fn()
  on = vi.fn()
  setPosition = vi.fn()
  setSize = vi.fn()
  showInactive(): void {
    this.visible = true
  }
  hide(): void {
    this.visible = false
  }
  isVisible(): boolean {
    return this.visible
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
  }
}

const display = {
  id: 7,
  scaleFactor: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  size: { width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
}
let sources: { id: string; name: string; display_id: string }[] = []
type Rect = { left: number; top: number; right: number; bottom: number }
let areas: { frame: Rect; client: Rect } | null = null

vi.mock('electron', () => ({
  app: { once: () => {} },
  BrowserWindow: FakeWindow,
  desktopCapturer: { getSources: async () => sources },
  screen: {
    getAllDisplays: () => [display],
    getPrimaryDisplay: () => display,
    getDisplayMatching: () => display,
    screenToDipRect: (_win: unknown, r: unknown) => r,
    dipToScreenRect: (_win: unknown, r: unknown) => r
  }
}))
vi.mock('koffi', () => ({ default: {} }))
vi.mock('../src/main/system/foreground', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/main/system/foreground')>()),
  windowAreas: () => areas,
  windowProgram: () => null
}))

const toast = await import('../src/main/windows/toast')
const watch = await import('../src/main/windows/screenWatch')

const SILKSONG = { id: 'silksong', name: 'Hollow Knight: Silksong' } as GameProfile
const HANDLE = 263450n
const measure: SilksongMeasure = {
  brightness: 0.4,
  masks: 5,
  areaText: 0,
  bossText: 0.1,
  pickupText: 0
}
const open = (): FakeWindow[] => FakeWindow.all.filter((w) => !w.destroyed)
const sentOn = (channel: string): unknown[][] =>
  open().flatMap((w) => w.sent.filter((s) => s[0] === channel))
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

describe('choosing what to capture', () => {
  const list = [
    { id: 'screen:0:0', name: 'Entire screen' },
    { id: 'window:1111:0', name: 'Notepad' },
    { id: `window:${HANDLE}:0`, name: 'Hollow Knight Silksong' }
  ]

  it('picks the window whose source id holds the game window handle', () => {
    expect(watch.sourceFor(list, HANDLE, 'Notepad')).toBe(`window:${HANDLE}:0`)
  })

  it('falls back to the window with the same title', () => {
    expect(watch.sourceFor(list, 999n, 'hollow knight silksong')).toBe(`window:${HANDLE}:0`)
    expect(watch.sourceFor(list, null, 'Notepad')).toBe('window:1111:0')
  })

  it('finds nothing when neither the handle nor the title match', () => {
    expect(watch.sourceFor(list, 999n, 'Silksong')).toBeNull()
    expect(watch.sourceFor(list, null, '')).toBeNull()
    // A screen never stands in for a window, even with the same name.
    expect(watch.sourceFor(list, null, 'Entire screen')).toBeNull()
  })
})

describe('the client area inside the captured window', () => {
  const frame = { left: 0, top: 0, right: 1000, bottom: 800 }

  it('leaves out the title bar and borders of a bordered window', () => {
    const client = { left: 10, top: 40, right: 990, bottom: 790 }
    expect(watch.clientBox(frame, client)).toEqual({
      x: 0.01,
      y: 0.05,
      width: 0.98,
      height: 0.9375
    })
  })

  it('is the whole picture for a borderless or fullscreen window', () => {
    expect(watch.clientBox(frame, frame)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('is the whole picture when either area has no size (a minimized window)', () => {
    const empty = { left: 0, top: 0, right: 0, bottom: 0 }
    expect(watch.clientBox(frame, empty)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(watch.clientBox(empty, frame)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('stays inside the picture when the client area pokes out of it', () => {
    const client = { left: -8, top: 30, right: 1008, bottom: 808 }
    expect(watch.clientBox(frame, client)).toEqual({ x: 0, y: 0.0375, width: 1, height: 0.9625 })
  })
})

describe('watching the game window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWindow.all = []
    sources = [
      { id: 'screen:0:0', name: 'Entire screen', display_id: '7' },
      { id: `window:${HANDLE}:0`, name: 'Hollow Knight Silksong', display_id: '' }
    ]
    // A bordered 1280x720 window: a 36 px title bar above a 1280x684 client area.
    areas = {
      frame: { left: 100, top: 50, right: 1380, bottom: 770 },
      client: { left: 100, top: 86, right: 1380, bottom: 770 }
    }
    toast.setUpToast(() => {}, 'preload.js')
  })
  afterEach(() => {
    watch.stopScreenWatch()
    toast.closeToast()
    vi.useRealTimers()
  })

  async function startWatching(
    onMeasure: (m: SilksongMeasure, time: number) => void = () => {}
  ): Promise<void> {
    await watch.startScreenWatch(SILKSONG, HANDLE, onMeasure)
    toast.toastReady()
  }

  it('asks the pop-up window to stream the game window, at its full size', async () => {
    await startWatching()
    expect(watch.screenWatching()).toBe(true)
    expect(sentOn('screen:start')).toEqual([
      [
        'screen:start',
        {
          sourceId: `window:${HANDLE}:0`,
          fps: 4,
          width: 480,
          maxWidth: 1280,
          maxHeight: 720,
          crop: { x: 0, y: 0.05, width: 1, height: 0.95 }
        }
      ]
    ])
    // The pop-up stays hidden: capturing shows nothing.
    expect(open()[0].visible).toBe(false)
  })

  it('captures the whole display when the game window is not among the sources', async () => {
    sources = sources.filter((s) => s.id.startsWith('screen:'))
    await startWatching()
    expect(sentOn('screen:start')[0][1]).toMatchObject({
      sourceId: 'screen:0:0',
      maxWidth: 1920,
      maxHeight: 1080,
      // Still measured inside the game's client area, now as a part of the display.
      crop: { x: 100 / 1920, y: 86 / 1080, width: 1280 / 1920, height: 684 / 1080 }
    })
  })

  it('stops the stream when asked, and is no longer watching', async () => {
    await startWatching()
    watch.stopScreenWatch()
    expect(watch.screenWatching()).toBe(false)
    expect(sentOn('screen:stop')).toEqual([['screen:stop']])
  })

  it('passes the measurements on while watching, and drops them afterwards', async () => {
    const seen: SilksongMeasure[] = []
    await startWatching((m) => seen.push(m))
    watch.takeMeasure(measure)
    watch.stopScreenWatch()
    watch.takeMeasure(measure)
    expect(seen).toEqual([measure])
  })

  it('drops measurements that are not numbers in range', async () => {
    const seen: SilksongMeasure[] = []
    await startWatching((m) => seen.push(m))
    for (const bad of [
      null,
      'bright',
      { ...measure, brightness: Number.NaN },
      { ...measure, masks: 2.5 },
      { ...measure, masks: 99 },
      { ...measure, bossText: 3 },
      { brightness: 0.4 }
    ]) {
      watch.takeMeasure(bad)
    }
    expect(seen).toEqual([])
  })

  it('restarts the stream when the game window changes size', async () => {
    await startWatching()
    const whole = { left: 0, top: 0, right: 1920, bottom: 1080 }
    areas = { frame: whole, client: whole }
    await vi.advanceTimersByTimeAsync(2_000)
    const starts = sentOn('screen:start')
    expect(starts).toHaveLength(2)
    expect(starts[1][1]).toMatchObject({
      maxWidth: 1920,
      maxHeight: 1080,
      crop: { x: 0, y: 0, width: 1, height: 1 }
    })
  })

  it('restarts the stream when only the client area changes, as when the title bar goes', async () => {
    await startWatching()
    areas = { frame: areas!.frame, client: areas!.frame }
    await vi.advanceTimersByTimeAsync(2_000)
    const starts = sentOn('screen:start')
    expect(starts).toHaveLength(2)
    expect(starts[1][1]).toMatchObject({
      maxWidth: 1280,
      crop: { x: 0, y: 0, width: 1, height: 1 }
    })
  })

  it('keeps the same stream while nothing about the window changes', async () => {
    await startWatching()
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(1_000)
      watch.takeMeasure(measure)
    }
    expect(sentOn('screen:start')).toHaveLength(1)
  })

  it('starts the stream again when no measurement has arrived for a while', async () => {
    await startWatching()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sentOn('screen:start')).toHaveLength(2)
  })

  it('returns a full-size picture of a region from the stream', async () => {
    await startWatching()
    const box = { x: 0.3, y: 0.2, width: 0.4, height: 0.1 }
    const picture = watch.grabRegion(box)
    const [[, id, sentBox]] = sentOn('screen:grab')
    expect(sentBox).toEqual(box)
    watch.takeGrab(id, PNG)
    const png = await picture
    expect(Buffer.isBuffer(png)).toBe(true)
    expect([...png!]).toEqual([...PNG])
  })

  it('gives no picture when the pop-up window does not answer within 2 seconds', async () => {
    await startWatching()
    const picture = watch.grabRegion({ x: 0, y: 0, width: 0.5, height: 0.5 })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await picture).toBeNull()
  })

  it('refuses pictures that are not PNGs, are too large, or were never asked for', async () => {
    await startWatching()
    const notPng = watch.grabRegion({ x: 0, y: 0, width: 0.5, height: 0.5 })
    watch.takeGrab(sentOn('screen:grab')[0][1], Uint8Array.from([1, 2, 3]))
    expect(await notPng).toBeNull()

    const tooLarge = watch.grabRegion({ x: 0, y: 0, width: 0.5, height: 0.5 })
    const huge = new Uint8Array(5 * 1024 * 1024)
    huge.set(PNG)
    watch.takeGrab(sentOn('screen:grab')[1][1], huge)
    expect(await tooLarge).toBeNull()

    // Unknown ids are ignored without a crash.
    watch.takeGrab(12345, PNG)
    watch.takeGrab('1', PNG)
  })

  it('gives no picture when not watching or for a region outside the frame', async () => {
    expect(await watch.grabRegion({ x: 0, y: 0, width: 1, height: 1 })).toBeNull()
    await startWatching()
    expect(await watch.grabRegion({ x: 0.9, y: 0, width: 0, height: 1 })).toBeNull()
    expect(await watch.grabRegion({ x: Number.NaN, y: 0, width: 1, height: 1 })).toBeNull()
    expect(sentOn('screen:grab')).toEqual([])
  })

  it('gives no picture for a request still waiting when the watch stops', async () => {
    await startWatching()
    const picture = watch.grabRegion({ x: 0, y: 0, width: 0.5, height: 0.5 })
    watch.stopScreenWatch()
    expect(await picture).toBeNull()
  })

  it('keeps the pop-up window open while watching, however long it is quiet', async () => {
    await startWatching()
    for (let i = 0; i < 6 * 60; i++) {
      watch.takeMeasure(measure)
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(open()).toHaveLength(1)
    watch.stopScreenWatch()
    await vi.advanceTimersByTimeAsync(6 * 60_000)
    expect(open()).toHaveLength(0)
  })
})
