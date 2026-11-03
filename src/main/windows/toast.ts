// Small pop-up that shows the companion's comments over the game without taking focus,
// so the player's keyboard and mouse stay in the game.
import { app, BrowserWindow, screen } from 'electron'
import type { SayRequest } from '../../shared/types'

const WIDTH = 400
const MIN_HEIGHT = 60
const MAX_HEIGHT = 200
const MARGIN = 16
const VISIBLE_MS = 8_000

let toast: BrowserWindow | null = null
let hideTimer: NodeJS.Timeout | null = null

export function createToast(
  load: (win: BrowserWindow, hash: string) => void,
  preload: string
): void {
  toast = new BrowserWindow({
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
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // This hidden window also speaks with GameMate's natural voice; keep it running at full speed.
      backgroundThrottling: false
    }
  })
  toast.setAlwaysOnTop(true, 'screen-saver')
  // Keep comments out of screenshots, so the observer doesn't react to its own words.
  toast.setContentProtection(true)
  // Alt+F4 or a close message would destroy the window; keep it and just hide it instead.
  let quitting = false
  app.once('before-quit', () => (quitting = true))
  toast.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    hideToast()
  })
  load(toast, 'toast')
}

export function showToast(text: string, displayId: number): void {
  if (!toast || !text) return
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const { x, y, width } = display.workArea
  toast.setPosition(Math.round(x + width - WIDTH - MARGIN), Math.round(y + MARGIN))
  toast.webContents.send('toast:show', text)
  toast.showInactive()
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(hideToast, VISIBLE_MS)
}

export function hideToast(): void {
  toast?.hide()
}

export function setToastHeight(height: unknown): void {
  if (!toast || typeof height !== 'number' || !Number.isFinite(height)) return
  toast.setSize(WIDTH, Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height))))
}

// Speak with GameMate's natural voice (Supertonic), which runs in this window.
export function sayInToast(request: SayRequest): boolean {
  if (!toast || toast.isDestroyed()) return false
  toast.webContents.send('voice:say', request)
  return true
}

export function hushToast(): void {
  if (toast && !toast.isDestroyed()) toast.webContents.send('voice:hush')
}
