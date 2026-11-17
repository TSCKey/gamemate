// Watches the game window as a live video stream, so a few numbers can be measured from it four
// times a second without taking a screenshot each time. The stream runs in the (hidden) comment
// pop-up window, which measures each frame and sends only the numbers here. Frames never leave
// that window, except a cropped picture of one region when the companion asks for text to read.
import { desktopCapturer, screen, type Display, type WebContents } from 'electron'
import type { GameProfile } from '../games/catalog'
import type { Box } from '../../shared/screen/frame'
import { SILKSONG_LAYOUT, type SilksongMeasure } from '../../shared/screen/silksong'
import type { ScreenStart } from '../../shared/types'
import { handleFromSourceId, windowProgram, windowRect } from '../system/foreground'
import { isToastPage, keepToastOpenWhile, sendToToast } from './toast'

const FPS = 4
// Wide enough to see the health masks and title text, small enough to measure in a few ms.
const MEASURE_WIDTH = 480
const GRAB_TIMEOUT_MS = 2_000
// A cropped region as PNG is far smaller than this; anything larger is refused.
const MAX_GRAB_BYTES = 4 * 1024 * 1024
// How often the window's size and place are checked, so a resize or a move restarts the stream.
const CHECK_MS = 1_000
// With no measurement for this long, the stream is started again (the page reloaded, or the
// capture failed to start).
const STALL_MS = 10_000
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

interface Choice {
  sourceId: string
  maxWidth: number
  maxHeight: number
}

interface Watch {
  handle: bigint | null
  title: string
  onMeasure: (m: SilksongMeasure, time: number) => void
  // What is being streamed now, and the window size and place it was chosen for.
  choice: Choice | null
  placement: string
  lastMeasure: number
  timer: ReturnType<typeof setInterval>
  checking: boolean
}

let watch: Watch | null = null
let lastGrab = 0
const grabs = new Map<number, (png: Buffer | null) => void>()

keepToastOpenWhile(screenWatching)

/**
 * The capture source of the game window: the one whose id holds its handle
 * ("window:<HWND>:0"), else the window with the same title, else none.
 */
export function sourceFor(
  sources: { id: string; name: string }[],
  handle: bigint | null,
  title: string
): string | null {
  const windows = sources.filter((s) => s.id.startsWith('window:'))
  if (handle !== null) {
    const byHandle = windows.find((s) => handleFromSourceId(s.id) === handle)
    if (byHandle) return byHandle.id
  }
  const wanted = title.trim().toLowerCase()
  if (!wanted) return null
  return windows.find((s) => s.name.trim().toLowerCase() === wanted)?.id ?? null
}

type Rect = { left: number; top: number; right: number; bottom: number }

function sizeOf(rect: Rect): { width: number; height: number } {
  return { width: rect.right - rect.left, height: rect.bottom - rect.top }
}

// The display showing most of the window (window bounds are in physical pixels).
function displayFor(rect: Rect | null): Display {
  if (!rect) return screen.getPrimaryDisplay()
  const physical = { x: rect.left, y: rect.top, ...sizeOf(rect) }
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, physical) : physical
  return screen.getDisplayMatching(dip)
}

// The window's size and display: when either changes, the stream is chosen again.
function placementOf(handle: bigint | null): string {
  const rect = handle !== null ? windowRect(handle) : null
  if (!rect) return 'none'
  const { width, height } = sizeOf(rect)
  return `${width}x${height}@${displayFor(rect).id}`
}

async function chooseSource(handle: bigint | null, title: string): Promise<Choice | null> {
  // A 0x0 thumbnail skips rendering previews that aren't needed.
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 }
  })
  const windowId = sourceFor(sources, handle, title)
  const matched = windowId ? handleFromSourceId(windowId) : null
  const rect = matched !== null ? windowRect(matched) : null
  // Streamed at the window's full size, so text read from a region is as sharp as on screen.
  if (windowId && rect) {
    const { width, height } = sizeOf(rect)
    if (width > 0 && height > 0) return { sourceId: windowId, maxWidth: width, maxHeight: height }
  }
  // The game window can't be captured on its own: the whole display it is on instead.
  const display = displayFor(handle !== null ? windowRect(handle) : null)
  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const source = screens.find((s) => s.display_id === String(display.id)) ?? screens[0]
  if (!source) return null
  return {
    sourceId: source.id,
    maxWidth: Math.round(display.size.width * display.scaleFactor),
    maxHeight: Math.round(display.size.height * display.scaleFactor)
  }
}

const sameChoice = (a: Choice | null, b: Choice): boolean =>
  !!a && a.sourceId === b.sourceId && a.maxWidth === b.maxWidth && a.maxHeight === b.maxHeight

// Chooses what to stream and (re)starts the stream if that changed, or always with `force`.
async function begin(w: Watch, force: boolean): Promise<void> {
  w.placement = placementOf(w.handle)
  const choice = await chooseSource(w.handle, w.title).catch((error) => {
    console.warn('Could not list the windows to capture', error)
    return null
  })
  // Stopped (or replaced by a new watch) while the sources were listed.
  if (watch !== w) return
  w.lastMeasure = Date.now()
  if (!choice || (!force && sameChoice(w.choice, choice))) return
  w.choice = choice
  const start: ScreenStart = { ...choice, fps: FPS, width: MEASURE_WIDTH }
  sendToToast('screen:start', start)
}

async function check(w: Watch): Promise<void> {
  if (watch !== w || w.checking) return
  const stalled = Date.now() - w.lastMeasure >= STALL_MS
  if (!stalled && placementOf(w.handle) === w.placement) return
  w.checking = true
  try {
    await begin(w, stalled)
  } finally {
    w.checking = false
  }
}

/**
 * Starts streaming the game window to the pop-up window, which sends back a measurement about four
 * times a second. Calling it again while watching the same window keeps the running stream.
 */
export async function startScreenWatch(
  game: GameProfile,
  windowHandle: bigint | null,
  onMeasure: (m: SilksongMeasure, time: number) => void
): Promise<void> {
  const previous = watch
  if (previous) clearInterval(previous.timer)
  const sameWindow = !!previous && previous.handle === windowHandle
  const w: Watch = {
    handle: windowHandle,
    title: (windowHandle !== null ? windowProgram(windowHandle)?.title : undefined) ?? game.name,
    onMeasure,
    choice: sameWindow ? previous.choice : null,
    placement: '',
    lastMeasure: Date.now(),
    timer: setInterval(() => void check(w), CHECK_MS),
    checking: false
  }
  // A waiting timer must not keep GameMate from quitting.
  w.timer.unref?.()
  watch = w
  await begin(w, false)
}

export function stopScreenWatch(): void {
  if (!watch) return
  clearInterval(watch.timer)
  watch = null
  for (const resolve of grabs.values()) resolve(null)
  grabs.clear()
  sendToToast('screen:stop')
}

export function screenWatching(): boolean {
  return watch !== null
}

// Only the pop-up window, and only while watching, may open a video stream of the screen.
export function screenWatchingFrom(contents: WebContents): boolean {
  return screenWatching() && isToastPage(contents)
}

// The pop-up window measured a frame. Its input is checked like any page's.
export function takeMeasure(raw: unknown): void {
  if (!watch) return
  const m = validMeasure(raw)
  if (!m) return
  watch.lastMeasure = Date.now()
  watch.onMeasure(m, watch.lastMeasure)
}

function validMeasure(raw: unknown): SilksongMeasure | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const share = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
  const { brightness, masks, areaText, bossText, pickupText } = r
  if (![brightness, areaText, bossText, pickupText].every(share)) return null
  if (
    typeof masks !== 'number' ||
    !Number.isInteger(masks) ||
    masks < 0 ||
    masks > SILKSONG_LAYOUT.masks.length
  ) {
    return null
  }
  return {
    brightness: brightness as number,
    masks,
    areaText: areaText as number,
    bossText: bossText as number,
    pickupText: pickupText as number
  }
}

function validBox(box: Box): boolean {
  const { x, y, width, height } = box
  return (
    [x, y, width, height].every(Number.isFinite) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1
  )
}

/**
 * A full-size PNG of one region of the live stream (for reading text), or null when not watching
 * or when the pop-up window doesn't answer within 2 seconds.
 */
export function grabRegion(box: Box): Promise<Buffer | null> {
  if (!watch || !validBox(box)) return Promise.resolve(null)
  const id = ++lastGrab
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), GRAB_TIMEOUT_MS)
    const finish = (png: Buffer | null): void => {
      clearTimeout(timer)
      grabs.delete(id)
      resolve(png)
    }
    grabs.set(id, finish)
    sendToToast('screen:grab', id, { x: box.x, y: box.y, width: box.width, height: box.height })
  })
}

// The pop-up window's answer to grabRegion: PNG bytes, or null when it had no frame.
export function takeGrab(id: unknown, png: unknown): void {
  if (typeof id !== 'number') return
  const finish = grabs.get(id)
  if (!finish) return
  const ok =
    png instanceof Uint8Array &&
    png.byteLength <= MAX_GRAB_BYTES &&
    PNG_SIGNATURE.every((byte, i) => png[i] === byte)
  finish(ok ? Buffer.from(png.buffer, png.byteOffset, png.byteLength) : null)
}
