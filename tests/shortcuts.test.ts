import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { shortcutFromKey, shortcutProblem } from '../src/shared/shortcuts'

type Result = ReturnType<typeof shortcutFromKey>

const userData = mkdtempSync(join(tmpdir(), 'gamemate-shortcuts-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

const press = (
  code: string,
  mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}
): Result =>
  shortcutFromKey({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods })

describe('choosing a shortcut', () => {
  it('turns key presses into shortcuts', () => {
    expect(press('Space', { altKey: true })).toEqual({ shortcut: 'Alt+Space' })
    expect(press('KeyG', { ctrlKey: true, shiftKey: true })).toEqual({ shortcut: 'Ctrl+Shift+G' })
    expect(press('F9')).toEqual({ shortcut: 'F9' })
    expect(press('ArrowUp', { metaKey: true })).toEqual({ shortcut: 'Super+Up' })
  })

  it('waits while only modifiers are held', () => {
    expect(press('AltLeft', { altKey: true })).toEqual({ pending: true })
  })

  it('refuses shortcuts that would get in the way of other apps', () => {
    expect(shortcutProblem('Ctrl+C')).toMatch(/Add Alt/)
    expect(shortcutProblem('G')).toMatch(/Add Alt/)
    expect(shortcutProblem('Shift+G')).toMatch(/Add Alt/)
    expect(shortcutProblem('Alt+F4')).toMatch(/Windows uses/)
    expect(shortcutProblem('Alt+Tab')).not.toBeNull()
    expect('error' in press('Escape', { altKey: true })).toBe(true)
  })
})

describe('shortcut settings', () => {
  it('keeps only valid, different shortcuts', async () => {
    const settings = await import('../src/main/system/settings')
    settings.resetSettings()
    expect(settings.updateSettings({ shortcut: 'Ctrl+Shift+G' }).shortcut).toBe('Ctrl+Shift+G')
    expect(settings.updateSettings({ shortcut: 'Ctrl+V' }).shortcut).toBe('Ctrl+Shift+G')
    // The same keys as the voice shortcut are ignored.
    const same = settings.updateSettings({ shortcut: settings.getSettings().voiceShortcut })
    expect(same.shortcut).toBe('Ctrl+Shift+G')
    // Swapping both at once works.
    const swapped = settings.updateSettings({ shortcut: 'Alt+V', voiceShortcut: 'Ctrl+Shift+G' })
    expect([swapped.shortcut, swapped.voiceShortcut]).toEqual(['Alt+V', 'Ctrl+Shift+G'])
  })
})
