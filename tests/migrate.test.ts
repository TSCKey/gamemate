import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateVoiceEngine, removeOldVoice } from '../src/main/voice/migrate'
import { SPEECH_MODELS } from '../src/main/voice/voiceModels'

let userData = mkdtempSync(join(tmpdir(), 'gamemate-migrate-settings-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

const KOKORO = join('onnx-community', 'Kokoro-82M-v1.0-ONNX')
const put = (dir: string, files: readonly string[]): void => {
  for (const name of files) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), 'x')
  }
}

describe('GameMate 0.1.3’s Kokoro download', () => {
  it('deletes 0.1.3’s English-only Kokoro files and leaves the speech models alone', async () => {
    const models = mkdtempSync(join(tmpdir(), 'gamemate-migrate-'))
    put(join(models, KOKORO), ['config.json', 'onnx/model.onnx', 'voices/af_heart.bin'])
    put(join(models, 'onnx-community', 'whisper-base.en'), ['config.json'])

    await removeOldVoice(models)
    expect(existsSync(join(models, KOKORO))).toBe(false)
    expect(existsSync(join(models, 'onnx-community', 'whisper-base.en', 'config.json'))).toBe(true)
    // Nothing to delete the next time.
    await expect(removeOldVoice(models)).resolves.toBeUndefined()
  })

  it('keeps Kokoro’s new download at every launch', async () => {
    const models = mkdtempSync(join(tmpdir(), 'gamemate-migrate-'))
    put(join(models, KOKORO), SPEECH_MODELS.kokoro.files)

    await removeOldVoice(models)
    await removeOldVoice(models)
    for (const name of SPEECH_MODELS.kokoro.files) {
      expect(existsSync(join(models, KOKORO, name))).toBe(true)
    }
  })
})

describe('older voice settings', () => {
  it('moves legacy or unknown voice settings to Kokoro or Supertonic, by language', () => {
    expect(migrateVoiceEngine('natural', 'en')).toBe('supertonic')
    expect(migrateVoiceEngine('windows', 'en')).toBe('kokoro')
    expect(migrateVoiceEngine('windows', 'ar')).toBe('supertonic')
    expect(migrateVoiceEngine('junk', 'hi')).toBe('supertonic')
    expect(migrateVoiceEngine(undefined, 'pt')).toBe('kokoro')
    expect(migrateVoiceEngine(undefined, 'de')).toBe('supertonic')
  })

  it('moves a Windows voice to a natural voice already downloaded that speaks the language', () => {
    const only = (
      kokoro: boolean,
      supertonic: boolean
    ): Record<'kokoro' | 'supertonic', boolean> => ({
      kokoro,
      supertonic
    })
    expect(migrateVoiceEngine('windows', 'en', only(false, true))).toBe('supertonic')
    expect(migrateVoiceEngine('windows', 'en', only(true, true))).toBe('kokoro')
    expect(migrateVoiceEngine('windows', 'es', only(true, false))).toBe('kokoro')
    // Kokoro doesn't speak German, downloaded or not.
    expect(migrateVoiceEngine('windows', 'de', only(true, false))).toBe('supertonic')
    // Nothing downloaded: Kokoro where it speaks the language.
    expect(migrateVoiceEngine('windows', 'fr', only(false, false))).toBe('kokoro')
    // A voice the player chose stays, downloaded or not.
    expect(migrateVoiceEngine('kokoro', 'en', only(false, true))).toBe('kokoro')
  })

  it('keeps a voice the player chose, even in a language it can’t speak', () => {
    expect(migrateVoiceEngine('kokoro', 'en')).toBe('kokoro')
    expect(migrateVoiceEngine('supertonic', 'it')).toBe('supertonic')
    // The Voice settings explain that Kokoro doesn't speak German; the choice isn't undone.
    expect(migrateVoiceEngine('kokoro', 'de')).toBe('kokoro')
  })
})

describe('loading saved voice settings', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'gamemate-migrate-settings-'))
    vi.resetModules()
  })

  const load = async (saved: object): Promise<import('../src/shared/types').Settings> => {
    writeFileSync(join(userData, 'settings.json'), JSON.stringify(saved))
    const { getSettings } = await import('../src/main/system/settings')
    return getSettings()
  }

  it('loads settings saved with the 0.1.3 Kokoro voice as Kokoro, without the Windows voice', async () => {
    const settings = await load({
      voiceEngine: 'kokoro',
      kokoroVoice: 'am_michael',
      voiceName: 'Microsoft Zira',
      voiceVolume: 0.5
    })
    expect(settings.voiceEngine).toBe('kokoro')
    expect(settings.kokoroVoice).toBe('male')
    expect(settings.voiceVolume).toBe(0.5)
    expect('voiceName' in settings).toBe(false)
  })

  it('moves a language no longer offered to English before choosing the voice', async () => {
    const settings = await load({ language: 'ja', voiceEngine: 'windows' })
    expect(settings.language).toBe('en')
    expect(settings.voiceEngine).toBe('kokoro')
  })

  it('gives a German Windows voice Supertonic', async () => {
    expect((await load({ language: 'de', voiceEngine: 'windows' })).voiceEngine).toBe('supertonic')
  })

  it('gives an English Windows voice Supertonic when only Supertonic is downloaded', async () => {
    put(join(userData, 'models', SPEECH_MODELS.supertonic.repo), SPEECH_MODELS.supertonic.files)
    expect((await load({ language: 'en', voiceEngine: 'windows' })).voiceEngine).toBe('supertonic')
  })

  it('keeps a German player’s Kokoro choice after a restart', async () => {
    expect((await load({ language: 'de', voiceEngine: 'kokoro' })).voiceEngine).toBe('kokoro')
  })
})

describe('the first language choice', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'gamemate-migrate-settings-'))
    vi.resetModules()
  })

  const choose = async (
    saved: object | null,
    ...languages: string[]
  ): Promise<import('../src/shared/types').Settings> => {
    if (saved) writeFileSync(join(userData, 'settings.json'), JSON.stringify(saved))
    const { updateSettings, getSettings } = await import('../src/main/system/settings')
    for (const language of languages) updateSettings({ language })
    return getSettings()
  }

  it('gives a new player the voice that speaks the language they pick', async () => {
    expect((await choose(null, 'de')).voiceEngine).toBe('supertonic')
    vi.resetModules()
    userData = mkdtempSync(join(tmpdir(), 'gamemate-migrate-settings-'))
    expect((await choose(null, 'ar')).voiceEngine).toBe('supertonic')
    vi.resetModules()
    userData = mkdtempSync(join(tmpdir(), 'gamemate-migrate-settings-'))
    expect((await choose(null, 'fr')).voiceEngine).toBe('kokoro')
  })

  it('moves an older GameMate’s Windows voice by the language picked at the first start', async () => {
    expect((await choose({ voiceEngine: 'windows' }, 'hi')).voiceEngine).toBe('supertonic')
  })

  it('keeps a voice that speaks the language picked', async () => {
    expect((await choose({ voiceEngine: 'supertonic' }, 'it')).voiceEngine).toBe('supertonic')
  })

  it('switches a saved voice that can’t speak the first language picked', async () => {
    // Saved before the player had ever picked a language, so it wasn't chosen for German.
    expect((await choose({ voiceEngine: 'kokoro' }, 'de')).voiceEngine).toBe('supertonic')
  })

  it('keeps the voice when the player changes the language later', async () => {
    expect((await choose(null, 'en', 'de')).voiceEngine).toBe('kokoro')
  })
})
