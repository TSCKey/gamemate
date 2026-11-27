import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-voice-models-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

const { SPEECH_MODELS, speechModelStatuses } = await import('../src/main/voice/voiceModels')

describe('the voice model store', () => {
  it('offers the Supertonic voice as a 401 MB download', () => {
    const supertonic = speechModelStatuses().find((m) => m.id === 'supertonic')
    expect(supertonic).toMatchObject({ kind: 'speak', sizeMb: 401, installed: false })
  })

  it('offers Kokoro as a 330 MB download of its model and every voice GameMate uses', () => {
    const kokoro = speechModelStatuses().find((m) => m.id === 'kokoro')
    expect(kokoro).toMatchObject({ kind: 'speak', sizeMb: 330, installed: false })
    const { repo, revision, files } = SPEECH_MODELS.kokoro
    expect(repo).toBe('onnx-community/Kokoro-82M-v1.0-ONNX')
    expect(revision).toMatch(/^[0-9a-f]{40}$/)
    expect(files).toEqual(
      expect.arrayContaining([
        'config.json',
        'tokenizer.json',
        'tokenizer_config.json',
        'onnx/model.onnx'
      ])
    )
    const voices = [
      'af_heart', 'ef_dora', 'ff_siwis', 'if_sara', 'pf_dora',
      'am_michael', 'em_alex', 'ff_siwis', 'im_nicola', 'pm_alex'
    ] // prettier-ignore
    for (const voice of voices) expect(files).toContain(`voices/${voice}.bin`)
    // French's one voice is downloaded once.
    expect(new Set(files).size).toBe(files.length)
    expect(files.filter((f) => f.startsWith('voices/'))).toHaveLength(9)
  })
})
