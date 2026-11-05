import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fresh temporary data folder per test, so each test starts with its own settings file.
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..'), quit: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {} },
  shell: {},
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('koffi', () => ({ default: {} }))

type SettingsModule = typeof import('../src/main/system/settings')
let settings: SettingsModule

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'gamemate-choices-'))
  vi.resetModules()
  settings = await import('../src/main/system/settings')
})

const saveFile = (data: object): void =>
  writeFileSync(join(userData, 'settings.json'), JSON.stringify(data))

describe('feature choices setting', () => {
  it('fresh install asks', () => {
    const s = settings.getSettings()
    expect(s.featureChoices).toBe('ask')
    expect(s.chatScreenshot).toBe(false)
    expect(s.closeToTray).toBe(true)
  })

  it('existing player who accepted is not asked', () => {
    saveFile({ termsVersion: 2, language: 'en' })
    expect(settings.getSettings().featureChoices).toBe('answered')
  })

  it('earlier install that never accepted is asked', () => {
    saveFile({ termsVersion: 0, language: 'en' })
    expect(settings.getSettings().featureChoices).toBe('ask')
  })

  it('only answered can be set', () => {
    expect(settings.updateSettings({ featureChoices: 'answered' }).featureChoices).toBe('answered')
    expect(settings.updateSettings({ featureChoices: 'ask' }).featureChoices).toBe('answered')
  })

  it('chatScreenshot is a boolean setting', () => {
    expect(settings.updateSettings({ chatScreenshot: true }).chatScreenshot).toBe(true)
    expect(settings.updateSettings({ chatScreenshot: 'yes' }).chatScreenshot).toBe(true)
  })

  it('delete my data asks again', () => {
    settings.updateSettings({ featureChoices: 'answered', chatScreenshot: true })
    const s = settings.resetSettings()
    expect(s.featureChoices).toBe('ask')
    expect(s.chatScreenshot).toBe(false)
    expect(settings.getSettings().featureChoices).toBe('ask')
  })
})
