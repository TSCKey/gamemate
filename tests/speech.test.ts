import { describe, expect, it } from 'vitest'
import { canListen, whisperOptions } from '../src/shared/speech'
import type { SpeechModelStatus } from '../src/shared/types'

const model = (patch: Partial<SpeechModelStatus>): SpeechModelStatus => ({
  id: 'accurate',
  kind: 'listen',
  sizeMb: 81,
  installed: false,
  englishOnly: false,
  repo: '',
  progress: null,
  error: null,
  ...patch
})

describe('speech recognition in the player’s language', () => {
  it('passes the language to multilingual Whisper only', () => {
    expect(whisperOptions('onnx-community/whisper-base', 'de')).toEqual({
      language: 'de',
      task: 'transcribe'
    })
    // English-only models refuse a language option.
    expect(whisperOptions('onnx-community/whisper-base.en', 'de')).toEqual({})
  })

  it('an English-only model listens only in English', () => {
    const old = model({ englishOnly: true, repo: 'onnx-community/whisper-base.en' })
    expect(canListen(old, 'en')).toBe(true)
    expect(canListen(old, 'de')).toBe(false)
    const multilingual = model({ installed: true, repo: 'onnx-community/whisper-base' })
    expect(canListen(multilingual, 'de')).toBe(true)
    expect(canListen(model({}), 'en')).toBe(false)
    expect(canListen(undefined, 'en')).toBe(false)
  })
})
