import { describe, expect, it } from 'vitest'
import { kokoroVoiceId, pickVoice } from '../src/shared/voices'
import { LANGUAGES } from '../src/shared/languages'

const base = {
  installed: { kokoro: true, supertonic: true },
  kokoroVoice: 'female',
  supertonicVoice: 'F1'
} as const

describe('the voice GameMate speaks with', () => {
  it('is the Kokoro voice of the language', () => {
    expect(pickVoice({ ...base, engine: 'kokoro', language: 'es' })).toEqual({
      kind: 'kokoro',
      voice: 'ef_dora'
    })
    expect(pickVoice({ ...base, engine: 'kokoro', kokoroVoice: 'male', language: 'es' })).toEqual({
      kind: 'kokoro',
      voice: 'em_alex'
    })
  })

  it('is no voice when Kokoro can’t speak the language', () => {
    expect(pickVoice({ ...base, engine: 'kokoro', language: 'de' })).toEqual({
      kind: 'none',
      reason: 'cantSpeak'
    })
  })

  it('is Supertonic in every language once it is installed', () => {
    expect(pickVoice({ ...base, engine: 'supertonic', language: 'de' })).toEqual({
      kind: 'supertonic',
      voice: 'F1'
    })
    expect(
      pickVoice({
        ...base,
        engine: 'supertonic',
        installed: { kokoro: true, supertonic: false },
        language: 'hi'
      })
    ).toEqual({ kind: 'none', reason: 'notDownloaded' })
  })

  it('is no voice while Kokoro isn’t downloaded', () => {
    expect(
      pickVoice({
        ...base,
        engine: 'kokoro',
        installed: { kokoro: false, supertonic: true },
        language: 'en'
      })
    ).toEqual({ kind: 'none', reason: 'notDownloaded' })
  })

  it('is the female voice in French, which has no male Kokoro voice', () => {
    expect(pickVoice({ ...base, engine: 'kokoro', kokoroVoice: 'male', language: 'fr' })).toEqual({
      kind: 'kokoro',
      voice: 'ff_siwis'
    })
  })
})

describe('the Kokoro voices', () => {
  it('cover English, Spanish, French, Italian and Portuguese', () => {
    expect(['en', 'es', 'fr', 'it', 'pt'].map((l) => kokoroVoiceId(l as 'en', 'female'))).toEqual([
      'af_heart',
      'ef_dora',
      'ff_siwis',
      'if_sara',
      'pf_dora'
    ])
    expect(['en', 'es', 'fr', 'it', 'pt'].map((l) => kokoroVoiceId(l as 'en', 'male'))).toEqual([
      'am_michael',
      'em_alex',
      'ff_siwis',
      'im_nicola',
      'pm_alex'
    ])
    expect(kokoroVoiceId('de', 'female')).toBeNull()
    expect(kokoroVoiceId('ar', 'male')).toBeNull()
    expect(kokoroVoiceId('hi', 'female')).toBeNull()
  })

  it('are listed for exactly the languages Kokoro speaks', () => {
    const kokoro = LANGUAGES.filter((l) => l.voices.includes('kokoro')).map((l) => l.code)
    expect(kokoro).toEqual(['en', 'fr', 'es', 'pt', 'it'])
    expect(LANGUAGES.every((l) => l.voices.includes('supertonic'))).toBe(true)
  })
})
