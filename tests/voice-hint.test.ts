import { describe, expect, it } from 'vitest'
import { cantSpeakHint, kokoroHasOneVoice, voiceHint } from '../src/renderer/src/voice/voiceHint'

const base = {
  installed: { kokoro: true, supertonic: true },
  kokoroVoice: 'female',
  supertonicVoice: 'F1'
} as const

describe('the line under the voice choice', () => {
  it('says nothing when the chosen voice speaks the language and is downloaded', () => {
    expect(voiceHint({ ...base, engine: 'kokoro', language: 'en' })).toEqual({ kind: 'ready' })
    expect(voiceHint({ ...base, engine: 'supertonic', language: 'hi' })).toEqual({ kind: 'ready' })
  })

  it('names Supertonic when Kokoro can’t speak the language', () => {
    for (const language of ['de', 'ar', 'hi'] as const) {
      expect(voiceHint({ ...base, engine: 'kokoro', language })).toEqual({
        kind: 'cantSpeak',
        other: 'supertonic'
      })
    }
  })

  it('says it can’t speak before it says it isn’t downloaded', () => {
    const installed = { kokoro: false, supertonic: false }
    expect(voiceHint({ ...base, installed, engine: 'kokoro', language: 'de' })).toEqual({
      kind: 'cantSpeak',
      other: 'supertonic'
    })
  })

  it('offers the download when the chosen voice isn’t downloaded', () => {
    const installed = { kokoro: false, supertonic: true }
    expect(voiceHint({ ...base, installed, engine: 'kokoro', language: 'fr' })).toEqual({
      kind: 'notDownloaded'
    })
    expect(
      voiceHint({
        ...base,
        installed: { kokoro: true, supertonic: false },
        engine: 'supertonic',
        language: 'de'
      })
    ).toEqual({ kind: 'notDownloaded' })
  })
})

describe('the hint under the language choice', () => {
  it('points to Supertonic when Kokoro can’t speak the language', () => {
    expect(cantSpeakHint('de', 'kokoro')).toEqual({ other: 'supertonic' })
  })

  it('is absent when the chosen voice speaks the language', () => {
    expect(cantSpeakHint('es', 'kokoro')).toBeNull()
    expect(cantSpeakHint('ar', 'supertonic')).toBeNull()
  })
})

describe('Kokoro’s female and male voices', () => {
  it('are one voice in French', () => {
    expect(kokoroHasOneVoice('fr')).toBe(true)
  })

  it('are two voices where Kokoro has both, and not a single one where it speaks nothing', () => {
    expect(kokoroHasOneVoice('en')).toBe(false)
    expect(kokoroHasOneVoice('pt')).toBe(false)
    expect(kokoroHasOneVoice('de')).toBe(false)
  })
})
