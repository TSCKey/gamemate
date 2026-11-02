// Paints the main window's title bar in GameMate's own colors, instead of the Windows accent
// color (when "Show accent color on title bars" is on) or a white bar, so it blends with the
// app. Windows 11 honors the colors; older Windows at least gets a dark title bar.
import koffi from 'koffi'
import { nativeTheme, type BrowserWindow } from 'electron'

const DWMWA_USE_IMMERSIVE_DARK_MODE = 20
const DWMWA_BORDER_COLOR = 34
const DWMWA_CAPTION_COLOR = 35
const DWMWA_TEXT_COLOR = 36

// The same colors as the chat window's header (--surface, --text and --border in main.css).
const CAPTION = '#1b1d22'
const TEXT = '#ebecef'
const BORDER = '#2d3037'

// Windows wants colors as 0x00BBGGRR.
export function colorRef(hex: string): number {
  const rgb = parseInt(hex.slice(1), 16)
  return ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)
}

type SetAttribute = (hwnd: bigint, attribute: number, value: Buffer, size: number) => number
let setAttribute: SetAttribute | null = null

export function themeTitleBar(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  // Electron sets the title bar's colors itself when a window appears and when the Windows theme
  // changes, so GameMate's colors go on right after.
  const apply = (): void => {
    setImmediate(() => {
      if (!win.isDestroyed()) paint(win)
    })
  }
  win.on('show', apply)
  nativeTheme.on('updated', apply)
  win.on('closed', () => nativeTheme.off('updated', apply))
}

function paint(win: BrowserWindow): void {
  try {
    setAttribute ??= koffi
      .load('dwmapi.dll')
      .func(
        'long __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 dwAttribute, void* pvAttribute, uint32 cbAttribute)'
      ) as SetAttribute
    const handle = win.getNativeWindowHandle()
    const hwnd = handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())
    const set = (attribute: number, value: number): void => {
      const buffer = Buffer.alloc(4)
      buffer.writeUInt32LE(value)
      setAttribute?.(hwnd, attribute, buffer, 4)
    }
    set(DWMWA_USE_IMMERSIVE_DARK_MODE, 1)
    set(DWMWA_CAPTION_COLOR, colorRef(CAPTION))
    set(DWMWA_TEXT_COLOR, colorRef(TEXT))
    set(DWMWA_BORDER_COLOR, colorRef(BORDER))
  } catch (error) {
    console.warn('Could not color the title bar', error)
  }
}
