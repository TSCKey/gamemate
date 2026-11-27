import { describe, expect, it } from 'vitest'
import {
  KOKORO_VOICE_FILES,
  isKokoroVoice,
  kokoroVoiceId,
  kokoroVoicesFor,
  pickVoice
} from '../src/shared/voices'
import { LANGUAGES } from '../src/shared/languages'

const base = {
  installed: { kokoro: true, supertonic: true },
  kokoroVoice: 'af_heart',
  supertonicVoice: 'F1'
} as const

describe('the voice GameMate speaks with', () => {
  it('is the Kokoro voice of the language', () => {
    expect(pickVoice({ ...base, engine: 'kokoro', language: 'es' })).toEqual({
      kind: 'kokoro',
      voice: 'ef_dora'
    })
    expect(
      pickVoice({ ...base, engine: 'kokoro', kokoroVoice: 'am_michael', language: 'es' })
    ).toEqual({
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
    expect(
      pickVoice({ ...base, engine: 'kokoro', kokoroVoice: 'am_michael', language: 'fr' })
    ).toEqual({
      kind: 'kokoro',
      voice: 'ff_siwis'
    })
  })
})

describe('the Kokoro voices', () => {
  it('are all of Kokoro’s voices in the languages GameMate speaks', () => {
    expect(kokoroVoicesFor('en')).toHaveLength(28)
    expect(kokoroVoicesFor('en').filter((v) => v.accent === 'us')).toHaveLength(20)
    expect(kokoroVoicesFor('en').filter((v) => v.accent === 'gb')).toHaveLength(8)
    expect(kokoroVoicesFor('es').map((v) => v.id)).toEqual(['ef_dora', 'em_alex', 'em_santa'])
    expect(kokoroVoicesFor('fr').map((v) => v.id)).toEqual(['ff_siwis'])
    expect(kokoroVoicesFor('it').map((v) => v.id)).toEqual(['if_sara', 'im_nicola'])
    expect(kokoroVoicesFor('pt').map((v) => v.id)).toEqual(['pf_dora', 'pm_alex', 'pm_santa'])
    expect(kokoroVoicesFor('de')).toEqual([])
    expect(KOKORO_VOICE_FILES).toHaveLength(37)
  })

  it('have a name and a gender, and the first of each language is its usual voice', () => {
    expect(kokoroVoicesFor('en')[0]).toEqual({
      id: 'af_heart',
      name: 'Heart',
      language: 'en',
      accent: 'us',
      gender: 'female'
    })
    expect(kokoroVoicesFor('en').find((v) => v.id === 'bm_george')).toMatchObject({
      name: 'George',
      accent: 'gb',
      gender: 'male'
    })
  })

  it('are the chosen voice in its own language, else the usual voice of the same gender', () => {
    expect(kokoroVoiceId('en', 'bm_george')).toBe('bm_george')
    expect(kokoroVoiceId('es', 'bm_george')).toBe('em_alex')
    expect(kokoroVoiceId('es', 'bf_emma')).toBe('ef_dora')
    expect(kokoroVoiceId('en', 'em_santa')).toBe('am_michael')
    expect(kokoroVoiceId('fr', 'am_adam')).toBe('ff_siwis')
    expect(kokoroVoiceId('it', 'pm_santa')).toBe('im_nicola')
    expect(kokoroVoiceId('de', 'af_heart')).toBeNull()
    expect(kokoroVoiceId('hi', 'am_michael')).toBeNull()
  })

  it('are only Kokoro’s own voice names', () => {
    expect(isKokoroVoice('af_heart')).toBe(true)
    expect(isKokoroVoice('pm_santa')).toBe(true)
    expect(isKokoroVoice('female')).toBe(false)
    expect(isKokoroVoice('../af_heart')).toBe(false)
    expect(isKokoroVoice(3)).toBe(false)
  })

  it('are listed for exactly the languages Kokoro speaks', () => {
    const kokoro = LANGUAGES.filter((l) => l.voices.includes('kokoro')).map((l) => l.code)
    expect(kokoro).toEqual(['en', 'fr', 'es', 'pt', 'it'])
    expect(kokoro.every((code) => kokoroVoicesFor(code).length > 0)).toBe(true)
    expect(LANGUAGES.every((l) => l.voices.includes('supertonic'))).toBe(true)
  })
})
