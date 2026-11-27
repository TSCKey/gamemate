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
  it('are English, German, French, Arabic, Spanish, Portuguese, Italian and Hindi, with Arabic the only right-to-left one', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'de', 'fr', 'ar', 'es', 'pt', 'it', 'hi'])
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ar'])
    expect(LANGUAGES.map((l) => l.nativeName)).toEqual([
      'English',
      'Deutsch',
      'Français',
      'العربية',
      'Español',
      'Português',
      'Italiano',
      'हिन्दी'
    ])
  })

  it('name themselves in lower case inside a sentence where their language does', () => {
    expect(LANGUAGES.map((l) => l.sentenceName)).toEqual([
      'English',
      'Deutsch',
      'français',
      'العربية',
      'español',
      'português',
      'italiano',
      'हिन्दी'
    ])
  })

  it('all have a natural voice', () => {
    expect(LANGUAGES.filter((l) => l.voices.length === 0)).toEqual([])
  })

  it('match Windows language tags, regional variants included', () => {
    expect(matchLanguage(['zh-Hant-TW', 'ja-JP'])).toBe('en')
    expect(matchLanguage(['es-MX'])).toBe('es')
    expect(matchLanguage(['pt-PT'])).toBe('pt')
    expect(matchLanguage(['it-IT'])).toBe('it')
    expect(matchLanguage(['hi-IN'])).toBe('hi')
    expect(matchLanguage(['de-AT'])).toBe('de')
    expect(matchLanguage(['fr-CA'])).toBe('fr')
    expect(matchLanguage(['ar-EG'])).toBe('ar')
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

  it('is unchosen for settings saved by GameMate 0.1.3, which keep everything else', async () => {
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
