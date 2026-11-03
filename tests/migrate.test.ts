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

  it('moves the Kokoro voice setting to Supertonic if it is installed, else Windows', () => {
    expect(migrateVoiceEngine('kokoro', false)).toBe('windows')
    expect(migrateVoiceEngine('kokoro', true)).toBe('natural')
    expect(migrateVoiceEngine('windows', true)).toBe('windows')
    expect(migrateVoiceEngine('natural', false)).toBe('natural')
    expect(migrateVoiceEngine(undefined, true)).toBe('windows')
  })

  it('loads settings saved with Kokoro as Windows voices, without the Kokoro voice', async () => {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ voiceEngine: 'kokoro', kokoroVoice: 'af_heart', voiceVolume: 0.5 })
    )
    const { getSettings } = await import('../src/main/system/settings')
    const settings = getSettings()
    expect(settings.voiceEngine).toBe('windows')
    expect(settings.voiceVolume).toBe(0.5)
    expect('kokoroVoice' in settings).toBe(false)
  })
})
