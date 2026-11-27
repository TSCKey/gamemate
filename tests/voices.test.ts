import { describe, expect, it, vi } from 'vitest'
import { pickVoice, windowsVoicesFor } from '../src/shared/voices'
import type { WindowsVoice } from '../src/shared/types'

// A test can make French a language without the natural voice, which no shipped language is.
let frenchWithoutNaturalVoice = false
vi.mock('../src/shared/languages', async (original) => {
  const real = await original<typeof import('../src/shared/languages')>()
  return {
    ...real,
    languageInfo: (code: Parameters<typeof real.languageInfo>[0]) => ({
      ...real.languageInfo(code),
      naturalVoice: !(frenchWithoutNaturalVoice && code === 'fr')
    })
  }
})

const voices: WindowsVoice[] = [
  { name: 'Microsoft Zira', language: 'en-US' },
  { name: 'Microsoft Hortense', language: 'fr-FR' },
  { name: 'Microsoft Huihui', language: 'zh-CN' }
]
const base = {
  engine: 'natural',
  naturalInstalled: true,
  naturalVoice: 'F1',
  voiceName: 'Microsoft Zira',
  windowsVoices: voices
} as const

describe('the voice GameMate speaks with', () => {
  it('is Supertonic where it speaks the language', () => {
    expect(pickVoice({ ...base, language: 'de' })).toEqual({ kind: 'natural', voice: 'F1' })
  })

  it('is never Supertonic for a language it does not speak', () => {
    frenchWithoutNaturalVoice = true
    try {
      expect(pickVoice({ ...base, language: 'fr' })).toEqual({
        kind: 'windows',
        name: 'Microsoft Hortense'
      })
      expect(pickVoice({ ...base, language: 'fr', windowsVoices: voices.slice(0, 1) })).toEqual({
        kind: 'none'
      })
    } finally {
      frenchWithoutNaturalVoice = false
    }
  })

  it('switches to a Windows voice for the new language', () => {
    expect(pickVoice({ ...base, engine: 'windows', language: 'fr' })).toEqual({
      kind: 'windows',
      name: 'Microsoft Hortense'
    })
    expect(pickVoice({ ...base, naturalInstalled: false, language: 'en' })).toEqual({
      kind: 'windows',
      name: 'Microsoft Zira'
    })
    expect(pickVoice({ ...base, engine: 'windows', language: 'de' })).toEqual({ kind: 'none' })
  })

  it('keeps the chosen Windows voice when it speaks the language', () => {
    const two = [...voices, { name: 'Microsoft Mark', language: 'en-US' }]
    expect(
      pickVoice({
        ...base,
        engine: 'windows',
        voiceName: 'Microsoft Mark',
        windowsVoices: two,
        language: 'en'
      })
    ).toEqual({ kind: 'windows', name: 'Microsoft Mark' })
  })

  it('recognizes a voice chosen in GameMate 0.1.3 by its older name', () => {
    const two = [...voices, { name: 'Microsoft Mark', language: 'en-US' }]
    expect(
      pickVoice({
        ...base,
        engine: 'windows',
        voiceName: 'Microsoft Mark Desktop',
        windowsVoices: two,
        language: 'en'
      })
    ).toEqual({ kind: 'windows', name: 'Microsoft Mark' })
  })

  it('lists the Windows voices of a language', () => {
    expect(windowsVoicesFor('fr', voices).map((v) => v.name)).toEqual(['Microsoft Hortense'])
    expect(windowsVoicesFor('de', voices)).toEqual([])
  })
})
