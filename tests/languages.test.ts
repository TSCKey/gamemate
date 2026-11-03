import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { initialLanguage, LANGUAGES, matchLanguage } from '../src/shared/languages'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-languages-'))
vi.mock('electron', () => ({
  app: {
    getPath: () => userData,
    getAppPath: () => join(__dirname, '..'),
    getPreferredSystemLanguages: () => ['nl-NL', 'de-AT']
  },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

describe('supported languages', () => {
  it('are the twelve languages, with Arabic the only right-to-left one', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual([
      'en',
      'ar',
      'fr',
      'de',
      'es',
      'pt',
      'it',
      'tr',
      'ru',
      'ja',
      'zh',
      'ko'
    ])
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ar'])
    const names = LANGUAGES.map((l) => l.nativeName)
    for (const name of ['العربية', 'Deutsch', '日本語', '中文', '한국어']) {
      expect(names).toContain(name)
    }
  })

  it('all have the natural voice except Chinese', () => {
    expect(LANGUAGES.filter((l) => !l.naturalVoice).map((l) => l.code)).toEqual(['zh'])
  })

  it('match Windows language tags, regional variants included', () => {
    expect(matchLanguage(['zh-Hant-TW'])).toBe('zh')
    expect(matchLanguage(['pt-BR'])).toBe('pt')
    expect(matchLanguage(['nl-NL'])).toBe('en')
    expect(matchLanguage([])).toBe('en')
    expect(matchLanguage(['nl-NL', 'de-AT'])).toBe('de')
  })

  it("follow Windows' display language", async () => {
    const { systemLanguage } = await import('../src/main/system/language')
    expect(systemLanguage()).toBe('de')
  })
})

describe('the language setting', () => {
  it('starts unchosen and only accepts supported languages', async () => {
    const settings = await import('../src/main/system/settings')
    settings.resetSettings()
    expect(settings.getSettings().language).toBe('')
    expect(settings.updateSettings({ language: 'ar' }).language).toBe('ar')
    expect(settings.updateSettings({ language: 'xx' }).language).toBe('ar')
  })

  it('is unchosen for settings saved by GameMate 1.0.3, which keep everything else', async () => {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ termsVersion: 1, webLookup: true, shortcut: 'Ctrl+Shift+G' })
    )
    vi.resetModules()
    const fresh = await import('../src/main/system/settings')
    const loaded = fresh.getSettings()
    expect(loaded.language).toBe('')
    expect(loaded.webLookup).toBe(true)
    expect(loaded.shortcut).toBe('Ctrl+Shift+G')
  })
})

describe('the first-launch language picker', () => {
  it('starts on the language already chosen, else on the PC’s language', () => {
    expect(initialLanguage('', 'de')).toBe('de')
    expect(initialLanguage('fr', 'de')).toBe('fr')
  })
})
