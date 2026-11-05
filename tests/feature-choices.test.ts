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

// Which speech models count as installed, and the download calls, are controlled by each test.
let installed = new Set<string>()
const downloads: Array<{ id: string; done: () => void }> = []
const downloadSpeechModel = vi.fn(
  (id: string) => new Promise<void>((resolve) => downloads.push({ id, done: resolve }))
)
vi.mock('../src/main/voice/voiceModels', () => ({
  isSpeechModelInstalled: (id: string) => installed.has(id),
  isListenModelId: (id: unknown) => id === 'fast' || id === 'accurate',
  downloadSpeechModel: (id: string) => downloadSpeechModel(id)
}))

type SettingsModule = typeof import('../src/main/system/settings')
let settings: SettingsModule
let features: typeof import('../src/main/system/featureChoices')

beforeEach(async () => {
  installed = new Set()
  downloads.length = 0
  downloadSpeechModel.mockClear()
  userData = mkdtempSync(join(tmpdir(), 'gamemate-choices-'))
  vi.resetModules()
  settings = await import('../src/main/system/settings')
  features = await import('../src/main/system/featureChoices')
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

describe('applying feature choices', () => {
  const all = { games: true, lookups: true, voice: true, naturalVoice: false, screenshot: true, tray: false }

  beforeEach(() => {
    settings.acceptTerms()
  })

  it('turns on exactly what was ticked', () => {
    const s = features.applyFeatureChoices(all)
    expect(s.deviceConsent).toBe(true)
    expect(s.webLookup).toBe(true)
    expect(s.voiceInput).toBe(true)
    expect(s.chatScreenshot).toBe(true)
    expect(s.closeToTray).toBe(false)
    expect(s.speechModel).toBe('accurate')
    expect(s.featureChoices).toBe('answered')
    expect(s.consents.games).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(s.consents.lookups).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('nothing ticked changes nothing but answers', () => {
    const s = features.applyFeatureChoices({})
    expect(s.featureChoices).toBe('answered')
    expect(s.deviceConsent).toBe(false)
    expect(s.webLookup).toBe(false)
    expect(s.voiceInput).toBe(false)
    expect(s.closeToTray).toBe(false)
    expect(downloadSpeechModel).not.toHaveBeenCalled()
  })

  it('rejects junk', () => {
    expect(() => features.applyFeatureChoices(null)).toThrow('Invalid settings.')
    expect(() => features.applyFeatureChoices('all')).toThrow('Invalid settings.')
    expect(() => features.applyFeatureChoices({ games: 'true' })).toThrow('Invalid settings.')
    expect(() => features.applyFeatureChoices({ games: true, extra: 1 })).not.toThrow()
  })

  it('downloads only what was ticked and is missing', () => {
    features.applyFeatureChoices({ voice: true })
    expect(downloadSpeechModel).toHaveBeenCalledTimes(1)
    expect(downloadSpeechModel).toHaveBeenCalledWith('accurate')
    downloadSpeechModel.mockClear()
    installed.add('accurate')
    features.applyFeatureChoices({ voice: true })
    expect(downloadSpeechModel).not.toHaveBeenCalled()
  })

  it('natural voice downloads, then is used', async () => {
    settings.updateSettings({ language: 'en' })
    const s = features.applyFeatureChoices({ naturalVoice: true })
    expect(downloadSpeechModel).toHaveBeenCalledWith('supertonic')
    expect(s.voiceEngine).toBe('windows')
    installed.add('supertonic')
    downloads[0].done()
    await new Promise((r) => setTimeout(r, 0))
    expect(settings.getSettings().voiceEngine).toBe('natural')
  })

  it('failed natural voice download keeps Windows voices', async () => {
    settings.updateSettings({ language: 'en' })
    features.applyFeatureChoices({ naturalVoice: true })
    downloads[0].done()
    await new Promise((r) => setTimeout(r, 0))
    expect(settings.getSettings().voiceEngine).toBe('windows')
    expect(settings.getSettings().featureChoices).toBe('answered')
  })

  it('natural voice already installed is used right away', () => {
    settings.updateSettings({ language: 'en' })
    installed.add('supertonic')
    const s = features.applyFeatureChoices({ naturalVoice: true })
    expect(downloadSpeechModel).not.toHaveBeenCalled()
    expect(s.voiceEngine).toBe('natural')
  })

  it('no natural voice for Chinese', () => {
    settings.updateSettings({ language: 'zh' })
    installed.add('supertonic')
    const s = features.applyFeatureChoices({ naturalVoice: true })
    expect(downloadSpeechModel).not.toHaveBeenCalled()
    expect(s.voiceEngine).toBe('windows')
  })

  it('needs the Terms', async () => {
    vi.doMock('../src/main/ai/llamaEngine', () => ({ stopEngine: async () => {} }))
    vi.doMock('../src/main/windows/overlay', () => ({ hideOverlay: () => {} }))
    const { AFTER_TERMS } = await import('../src/main/ipc/legal')
    expect(AFTER_TERMS.has('features:apply')).toBe(true)
  })
})
