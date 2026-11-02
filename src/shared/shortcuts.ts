// The keyboard shortcuts the player can choose for the in-game window, in Electron's accelerator
// format ("Alt+Space"). Shared by the settings check and the key capture in Settings.

export const DEFAULT_SHORTCUT = 'Alt+Space'
export const DEFAULT_VOICE_SHORTCUT = 'Alt+V'

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super']
const KEY =
  /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/
// Windows' own shortcuts: taking them would break closing windows and switching apps.
const RESERVED = new Set(['Alt+F4', 'Alt+Tab', 'Ctrl+Alt+Delete'])

// Why a shortcut can't be used, or null if it can. A shortcut works in every app, so it needs Alt
// or the Windows key, or Ctrl together with Shift (Ctrl+C alone would stop copying everywhere);
// F keys work on their own.
export function shortcutProblem(shortcut: string): string | null {
  const parts = shortcut.split('+')
  const key = parts.pop() ?? ''
  if (!KEY.test(key)) return 'That key can’t be used. Use a letter, a number, an F key or Space.'
  if (parts.some((p) => !MODIFIERS.includes(p)) || new Set(parts).size !== parts.length) {
    return 'That shortcut can’t be used.'
  }
  if (RESERVED.has(shortcut)) return 'Windows uses that shortcut itself.'
  const fKey = /^F\d+$/.test(key)
  const safe =
    parts.includes('Alt') ||
    parts.includes('Super') ||
    (parts.includes('Ctrl') && parts.includes('Shift'))
  if (!fKey && !safe) {
    return 'Add Alt (or the Windows key, or Ctrl+Shift) so the shortcut doesn’t get in the way of typing in other apps.'
  }
  return null
}

export function isValidShortcut(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && shortcutProblem(value) === null
}

export interface KeyPress {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

// Physical keys GameMate can use, by KeyboardEvent.code.
function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const named: Record<string, string> = {
    Space: 'Space',
    Insert: 'Insert',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right'
  }
  return named[code] ?? null
}

// Turns a key press in Settings into a shortcut. While only modifiers are held, it waits for the
// key ("pending").
export function shortcutFromKey(
  press: KeyPress
): { shortcut: string } | { error: string } | { pending: true } {
  if (/^(Control|Alt|Shift|Meta)(Left|Right)?$/.test(press.code)) return { pending: true }
  const key = keyName(press.code)
  if (!key) return { error: 'That key can’t be used. Use a letter, a number, an F key or Space.' }
  const shortcut = [
    ...(press.ctrlKey ? ['Ctrl'] : []),
    ...(press.altKey ? ['Alt'] : []),
    ...(press.shiftKey ? ['Shift'] : []),
    ...(press.metaKey ? ['Super'] : []),
    key
  ].join('+')
  const problem = shortcutProblem(shortcut)
  return problem ? { error: problem } : { shortcut }
}
