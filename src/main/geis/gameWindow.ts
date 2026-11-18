import { screen, type Display } from 'electron'
import { windowRect } from '../system/foreground'
import type { Box } from '../companion/hudAreas'

// The game window's place on screen (null when Windows won't say) and the display showing it.
export function gamePlace(handle: Parameters<typeof windowRect>[0]): {
  gameWindow: Box | null
  display: Display
} {
  const rect = windowRect(handle)
  const gameWindow = rect
    ? screen.screenToDipRect(null, {
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top
      })
    : null
  const display = gameWindow ? screen.getDisplayMatching(gameWindow) : screen.getPrimaryDisplay()
  return { gameWindow, display }
}
