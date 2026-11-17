// Which window is in front, and which program it belongs to, so GameMate only watches while the
// player is actually in a game and knows which game it is. Uses the Win32 API through koffi; on
// other platforms these helpers report "unknown".
import koffi from 'koffi'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

interface Point {
  x: number
  y: number
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const MAX_TEXT = 512
// The window's bounds as drawn on screen, without the invisible resize borders.
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const RECT_BYTES = 16

let win32: {
  getForegroundWindow: () => number | bigint
  getWindowRect: (hwnd: bigint, rect: Rect) => boolean
  getClientRect: (hwnd: bigint, rect: Rect) => boolean
  clientToScreen: (hwnd: bigint, point: Point) => boolean
  dwmGetWindowAttribute: (hwnd: bigint, attribute: number, rect: Rect, size: number) => number
  getWindowThreadProcessId: (hwnd: bigint, pid: number[]) => number
  getWindowText: (hwnd: bigint, buffer: Buffer, max: number) => number
  openProcess: (access: number, inherit: number, pid: number) => unknown
  queryFullProcessImageName: (
    process: unknown,
    flags: number,
    buffer: Buffer,
    size: number[]
  ) => number
  closeHandle: (handle: unknown) => number
} | null = null

function api(): typeof win32 {
  if (win32 || process.platform !== 'win32') return win32
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const dwmapi = koffi.load('dwmapi.dll')
  koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
  koffi.struct('POINT', { x: 'long', y: 'long' })
  win32 = {
    // Window handles are passed as plain integers so they can be compared with capture ids.
    getForegroundWindow: user32.func('intptr __stdcall GetForegroundWindow()'),
    getWindowRect: user32.func('bool __stdcall GetWindowRect(intptr hWnd, _Out_ RECT* lpRect)'),
    getClientRect: user32.func('bool __stdcall GetClientRect(intptr hWnd, _Out_ RECT* lpRect)'),
    clientToScreen: user32.func(
      'bool __stdcall ClientToScreen(intptr hWnd, _Inout_ POINT* lpPoint)'
    ),
    dwmGetWindowAttribute: dwmapi.func(
      'long __stdcall DwmGetWindowAttribute(intptr hwnd, uint32 dwAttribute, _Out_ RECT* pvAttribute, uint32 cbAttribute)'
    ),
    getWindowThreadProcessId: user32.func(
      'uint32 __stdcall GetWindowThreadProcessId(intptr hWnd, _Out_ uint32* lpdwProcessId)'
    ),
    getWindowText: user32.func(
      'int __stdcall GetWindowTextW(intptr hWnd, void* lpString, int nMaxCount)'
    ),
    openProcess: kernel32.func(
      'void* __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'
    ),
    queryFullProcessImageName: kernel32.func(
      'int __stdcall QueryFullProcessImageNameW(void* hProcess, uint32 dwFlags, void* lpExeName, _Inout_ uint32* lpdwSize)'
    ),
    closeHandle: kernel32.func('int __stdcall CloseHandle(void* hObject)')
  }
  return win32
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

// The window as a capture pictures it (its visible frame, title bar and borders included) and its
// client area (where the game draws), both in physical screen pixels.
export function windowAreas(handle: bigint): { frame: Rect; client: Rect } | null {
  const win = api()
  if (!win) return null
  const frame: Rect = { left: 0, top: 0, right: 0, bottom: 0 }
  // Without desktop composition details, the plain window bounds are the next best thing.
  const visible =
    win.dwmGetWindowAttribute(handle, DWMWA_EXTENDED_FRAME_BOUNDS, frame, RECT_BYTES) === 0 ||
    win.getWindowRect(handle, frame)
  if (!visible) return null
  const size: Rect = { left: 0, top: 0, right: 0, bottom: 0 }
  const origin: Point = { x: 0, y: 0 }
  if (!win.getClientRect(handle, size) || !win.clientToScreen(handle, origin)) return null
  const client = {
    left: origin.x,
    top: origin.y,
    right: origin.x + size.right,
    bottom: origin.y + size.bottom
  }
  return { frame, client }
}

export interface WindowProgram {
  handle: bigint
  pid: number
  // Full path of the program, e.g. "C:\Games\Terraria\Terraria.exe".
  exe: string
  title: string
}

// The program a window belongs to and its title (null if Windows won't say).
export function windowProgram(handle: bigint): WindowProgram | null {
  const win = api()
  if (!win) return null
  const pid = [0]
  win.getWindowThreadProcessId(handle, pid)
  if (!pid[0]) return null
  const titleBuffer = Buffer.alloc(MAX_TEXT * 2)
  const titleLength = win.getWindowText(handle, titleBuffer, MAX_TEXT)
  const title = titleBuffer.toString('utf16le', 0, titleLength * 2)

  const process = win.openProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid[0])
  if (!process) return null
  try {
    const pathBuffer = Buffer.alloc(1024 * 2)
    const size = [1024]
    if (!win.queryFullProcessImageName(process, 0, pathBuffer, size)) return null
    return { handle, pid: pid[0], exe: pathBuffer.toString('utf16le', 0, size[0] * 2), title }
  } finally {
    win.closeHandle(process)
  }
}
