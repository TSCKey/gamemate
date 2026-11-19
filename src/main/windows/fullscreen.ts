// Whether the window in front fills a whole display: a game in fullscreen or borderless
// fullscreen. Used to keep the comment pop-up off the game when the player asked for that.
import { screen } from 'electron'
import { foregroundHandle, windowRect, type Rect } from '../system/foreground'

// Rounding when Windows scales a display can leave a pixel or so either way.
const SLACK = 2

export function coversDisplay(window: Rect, display: Rect): boolean {
  return (
    window.left <= display.left + SLACK &&
    window.top <= display.top + SLACK &&
    window.right >= display.right - SLACK &&
    window.bottom >= display.bottom - SLACK
  )
}

// Display bounds in physical pixels, like window bounds.
function displayRects(): Rect[] {
  return screen.getAllDisplays().map((display) => {
    const { x, y, width, height } =
      process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : display.bounds
    return { left: x, top: y, right: x + width, bottom: y + height }
  })
}

export function foregroundFillsDisplay(): boolean {
  const handle = foregroundHandle()
  const rect = handle !== null ? windowRect(handle) : null
  if (!rect) return false
  return displayRects().some((display) => coversDisplay(rect, display))
}
