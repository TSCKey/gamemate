// The floating question window opened with the global shortcut, shown on top of games.
import { BrowserWindow, screen } from 'electron'
import { captureDisplay, type Screenshot } from './capture'
import { getSettings } from './settings'

const WIDTH = 640
const MIN_HEIGHT = 72
const MAX_HEIGHT = 560

let overlay: BrowserWindow | null = null
// Screenshot taken the moment the shortcut was pressed, so it shows the game, not GameMate.
let pendingShot: Promise<Screenshot | null> = Promise.resolve(null)

export function createOverlay(
  load: (win: BrowserWindow, hash: string) => void,
  preload: string
): void {
  overlay = new BrowserWindow({
    width: WIDTH,
    height: MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  // 'screen-saver' keeps it above borderless/full-screen windowed games.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  // Keep the floating window out of every screenshot, including GameMate's own.
  overlay.setContentProtection(true)
  load(overlay, 'overlay')
}

export function toggleOverlay(): void {
  if (!overlay) return
  if (overlay.isVisible() && overlay.isFocused()) {
    overlay.hide()
    return
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  if (!overlay.isVisible()) {
    pendingShot = getSettings().overlayScreenshot
      ? captureDisplay(display.id).catch((error) => {
          console.error('Screenshot failed', error)
          return null
        })
      : Promise.resolve(null)

    // setPosition/setSize rather than setBounds: setBounds miscalculates the size when
    // moving between monitors with different display scaling.
    const { x, y, width, height } = display.workArea
    overlay.setPosition(Math.round(x + (width - WIDTH) / 2), Math.round(y + height * 0.12))
  }
  overlay.show()
  overlay.focus()
  overlay.webContents.send('overlay:shown')
}

export function hideOverlay(): void {
  overlay?.hide()
}

export function setOverlayHeight(height: unknown): void {
  if (!overlay || typeof height !== 'number' || !Number.isFinite(height)) return
  const h = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)))
  overlay.setSize(WIDTH, h)
}

export function takePendingScreenshot(): Promise<Screenshot | null> {
  const shot = pendingShot
  // Each screenshot is used for one question at most.
  pendingShot = Promise.resolve(null)
  return shot
}
