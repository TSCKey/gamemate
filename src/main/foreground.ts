// Which window is in front, so GameMate only watches while the player is actually in the game.
// Uses the Win32 API through koffi; on other platforms these helpers report "unknown".
import koffi from 'koffi'

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

let user32: {
  getForegroundWindow: () => number | bigint
  getWindowRect: (hwnd: bigint, rect: Rect) => boolean
} | null = null

function api(): typeof user32 {
  if (user32 || process.platform !== 'win32') return user32
  const lib = koffi.load('user32.dll')
  koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
  user32 = {
    // Window handles are passed as plain integers so they can be compared with capture ids.
    getForegroundWindow: lib.func('intptr __stdcall GetForegroundWindow()'),
    getWindowRect: lib.func('bool __stdcall GetWindowRect(intptr hWnd, _Out_ RECT* lpRect)')
  }
  return user32
}

// desktopCapturer window ids look like "window:<HWND>:0".
export function handleFromSourceId(sourceId: string): bigint | null {
  const match = /^window:(\d+):/.exec(sourceId)
  return match ? BigInt(match[1]) : null
}

export function foregroundHandle(): bigint | null {
  const win = api()
  if (!win) return null
  const handle = BigInt(win.getForegroundWindow())
  return handle === 0n ? null : handle
}

// Window bounds in physical screen pixels.
export function windowRect(handle: bigint): Rect | null {
  const win = api()
  if (!win) return null
  const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 }
  return win.getWindowRect(handle, rect) ? rect : null
}
