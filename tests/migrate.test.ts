import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { migrateVoiceEngine, removeOldVoice } from '../src/main/voice/migrate'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-migrate-settings-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

describe('moving from Kokoro to Supertonic', () => {
  it('deletes Kokoro’s files and leaves the speech models alone', async () => {
    const models = mkdtempSync(join(tmpdir(), 'gamemate-migrate-'))
    const kokoro = join(models, 'onnx-community', 'Kokoro-82M-v1.0-ONNX', 'onnx')
    const whisper = join(models, 'onnx-community', 'whisper-base.en')
    mkdirSync(kokoro, { recursive: true })
    mkdirSync(whisper, { recursive: true })
    writeFileSync(join(kokoro, 'model.onnx'), 'x')
    writeFileSync(join(whisper, 'config.json'), '{}')

    await removeOldVoice(models)
    expect(existsSync(join(models, 'onnx-community', 'Kokoro-82M-v1.0-ONNX'))).toBe(false)
    expect(existsSync(join(whisper, 'config.json'))).toBe(true)
    // Nothing to delete the next time.
    await expect(removeOldVoice(models)).resolves.toBeUndefined()
  })

  it('moves older voice settings to Kokoro or Supertonic, by language', () => {
    expect(migrateVoiceEngine('natural', 'en')).toBe('supertonic')
    expect(migrateVoiceEngine('windows', 'en')).toBe('kokoro')
    expect(migrateVoiceEngine('windows', 'ar')).toBe('supertonic')
    expect(migrateVoiceEngine('kokoro', 'en')).toBe('kokoro')
    expect(migrateVoiceEngine('junk', 'hi')).toBe('supertonic')
    expect(migrateVoiceEngine(undefined, 'pt')).toBe('kokoro')
    expect(migrateVoiceEngine('supertonic', 'it')).toBe('supertonic')
    // Kokoro doesn't speak German.
    expect(migrateVoiceEngine('kokoro', 'de')).toBe('supertonic')
  })

  it('loads settings saved with the 0.1.3 Kokoro voice as Kokoro, without the Windows voice', async () => {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({
        voiceEngine: 'kokoro',
        kokoroVoice: 'am_michael',
        voiceName: 'Microsoft Zira',
        voiceVolume: 0.5
      })
    )
    const { getSettings } = await import('../src/main/system/settings')
    const settings = getSettings()
    expect(settings.voiceEngine).toBe('kokoro')
    expect(settings.kokoroVoice).toBe('male')
    expect(settings.voiceVolume).toBe(0.5)
    expect('voiceName' in settings).toBe(false)
  })
})
