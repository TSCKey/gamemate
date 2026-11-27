import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('../src/main/voice/voiceModels', () => ({
  isSpeechModelInstalled: () => false,
  isListenModelId: (id: unknown) => id === 'fast' || id === 'accurate'
}))

const version = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version
let settings: typeof import('../src/main/system/settings')

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'gamemate-notes-'))
  vi.resetModules()
  settings = await import('../src/main/system/settings')
})

const saveFile = (data: object): void =>
  writeFileSync(join(userData, 'settings.json'), JSON.stringify(data))

describe('the last version whose notes the player saw', () => {
  it('is this version on a new install, so no notes show', () => {
    expect(settings.getSettings().lastSeenVersion).toBe(version)
  })

  it('is 0.3.0 for a player updating from a version without patch notes', () => {
    saveFile({ termsVersion: 2, language: 'en' })
    expect(settings.getSettings().lastSeenVersion).toBe('0.3.0')
  })

  it('is kept as saved', () => {
    saveFile({ termsVersion: 3, language: 'en', lastSeenVersion: '0.4.0' })
    expect(settings.getSettings().lastSeenVersion).toBe('0.4.0')
  })

  it('only changes to a version number', () => {
    settings.updateSettings({ lastSeenVersion: '0.4.0' })
    expect(settings.getSettings().lastSeenVersion).toBe('0.4.0')
    settings.updateSettings({ lastSeenVersion: 'latest' })
    settings.updateSettings({ lastSeenVersion: 4 })
    expect(settings.getSettings().lastSeenVersion).toBe('0.4.0')
  })
})

describe('a player who never got past the first start of 0.3.0', () => {
  it('sees no notes, since they never knew the earlier version', async () => {
    saveFile({ termsVersion: 0, language: '' })
    expect(settings.getSettings().lastSeenVersion).toBe(version)
  })
})
