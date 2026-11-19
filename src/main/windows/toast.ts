// Small pop-up that shows the companion's comments over the game without taking focus,
// so the player's keyboard and mouse stay in the game. GameMate's natural voice also speaks from
// this window. It is opened when there is something to show or say, and closed again after a few
// quiet minutes, so its page and the voice model don't stay in memory while nothing happens.
import { app, BrowserWindow, screen, type WebContents } from 'electron'
import { getSettings } from '../system/settings'
import type { SayRequest } from '../../shared/types'
import { idleTimer } from '../../shared/idle'
import { foregroundFillsDisplay } from './fullscreen'

const WIDTH = 400
const MIN_HEIGHT = 60
const MAX_HEIGHT = 200
const MARGIN = 16
const VISIBLE_MS = 8_000
const IDLE_MS = 5 * 60_000

let toast: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null
let open: { load: (win: BrowserWindow, hash: string) => void; preload: string } | null = null
// Whether the window's page is listening yet, and what waits for it until then.
let ready = false
let waiting: { say: boolean; run: (win: BrowserWindow) => void }[] = []
let speaking = false
let quitting = false
// Other work that runs in this window (watching the game's screen): it keeps the window open
// meanwhile, and is stopped when the window is closed anyway.
let alsoBusy: () => boolean = () => false
let stopAlso: () => void = () => {}

const idle = idleTimer(IDLE_MS, closeToast, () => speaking || !!toast?.isVisible() || alsoBusy())

// How the window is opened once it is needed.
export function setUpToast(
  load: (win: BrowserWindow, hash: string) => void,
  preload: string
): void {
  open = { load, preload }
  app.once('before-quit', () => (quitting = true))
}

function createToast(): BrowserWindow | null {
  // Nothing opens the window again while GameMate quits.
  if (!open || quitting) return null
  const win = new BrowserWindow({
    width: WIDTH,
    height: MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: open.preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // This hidden window also speaks with GameMate's natural voice; keep it running at full speed.
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  // Keep comments out of screenshots, so the observer doesn't react to its own words.
  win.setContentProtection(true)
  // Alt+F4 or a close message would destroy the window; just hide it instead.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    hideToast()
  })
  ready = false
  open.load(win, 'toast')
  return win
}

// Runs `run` with the window once its page is listening, opening the window if needed.
function withToast(run: (win: BrowserWindow) => void, say = false): boolean {
  if (!toast || toast.isDestroyed()) toast = createToast()
  if (!toast) return false
  idle.touch()
  if (ready) run(toast)
  else waiting.push({ say, run })
  return true
}

// Sends to the window's page, opening the window (hidden) if needed.
export function sendToToast(channel: string, ...args: unknown[]): boolean {
  return withToast((win) => win.webContents.send(channel, ...args))
}

// Keeps the window open while `busy` says its page is still at work; `stop` ends that work
// when the window is closed regardless (at quit), so it can't open the window again.
export function keepToastOpenWhile(busy: () => boolean, stop: () => void): void {
  alsoBusy = busy
  stopAlso = stop
}

// Whether the window exists, so a stop message doesn't open it just to be heard.
export function toastOpen(): boolean {
  return !!toast && !toast.isDestroyed()
}

// Whether a request comes from this window's page.
export function isToastPage(contents: WebContents): boolean {
  return !!toast && !toast.isDestroyed() && toast.webContents === contents
}

// The window's page has loaded and listens for comments and sentences.
export function toastReady(): void {
  if (!toast || toast.isDestroyed()) return
  ready = true
  const runs = waiting
  waiting = []
  for (const { run } of runs) run(toast)
}

export function showToast(text: string, displayId: number): void {
  if (!text) return
  withToast((win) => {
    const display =
      screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
    const { x, y, width } = display.workArea
    win.setPosition(Math.round(x + width - WIDTH - MARGIN), Math.round(y + MARGIN))
    win.webContents.send('toast:show', text)
    // This window also reads comments aloud, so it gets the text even when the pop-up stays hidden.
    const settings = getSettings()
    if (!settings.showComments) return
    // Over a fullscreen game only if the player wants it there; the comment is still said aloud.
    if (settings.hideCommentsInFullscreen && settings.speakComments && foregroundFillsDisplay()) {
      return
    }
    win.showInactive()
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(hideToast, VISIBLE_MS)
  })
}

export function hideToast(): void {
  if (toast && !toast.isDestroyed()) toast.hide()
}

export function setToastHeight(height: unknown): void {
  if (!toast || toast.isDestroyed()) return
  if (typeof height !== 'number' || !Number.isFinite(height)) return
  toast.setSize(WIDTH, Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))))
}

// Speak with GameMate's natural voice (Supertonic), which runs in this window.
export function sayInToast(request: SayRequest): boolean {
  const sent = withToast((win) => win.webContents.send('voice:say', request), true)
  if (sent) speaking = true
  return sent
}

// The page finished (or was stopped) saying the latest sentence.
export function toastDoneSpeaking(): void {
  speaking = false
  idle.touch()
}

export function hushToast(): void {
  // Sentences still waiting for the page are never said.
  if (waiting.some((w) => w.say)) {
    waiting = waiting.filter((w) => !w.say)
    speaking = false
  }
  if (toast && !toast.isDestroyed() && ready) toast.webContents.send('voice:hush')
}

// Frees the window, its page and the voice model with it.
export function closeToast(): void {
  // First, while the window can still be told to stop.
  stopAlso()
  idle.cancel()
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  waiting = []
  speaking = false
  ready = false
  if (toast && !toast.isDestroyed()) toast.destroy()
  toast = null
}
