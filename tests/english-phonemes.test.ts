// kokoro-js pronounces English with the `phonemizer` package (its own eSpeak NG build); GameMate
// swaps that package for its own eSpeak NG build (vendor/espeak-ng). It must sound the same.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { phonemize as theirs } from 'phonemizer'
import { phonemize } from '../src/renderer/src/voice/englishPhonemes'
import { phonemizeFor } from '../src/renderer/src/voice/kokoroText'

const SENTENCES = [
  'Hello there, welcome back.',
  'Nice shot! That boss never saw it coming.',
  "Don't stand in the fire; it's 25 degrees.",
  'Is the Ender Dragon worth fighting today?',
  'Dr. Smith paid $3.50 for 2 potions.',
  'GameMate is watching the kill feed.'
]

describe('English pronunciation through GameMate’s eSpeak NG', () => {
  it('is what kokoro-js got before, in American and British English', async () => {
    for (const voice of ['en-us', 'en']) {
      for (const text of SENTENCES) {
        expect(await phonemize(text, voice), `${voice}: ${text}`).toEqual(await theirs(text, voice))
      }
    }
  })

  it('is American English unless told otherwise, and refuses other languages', async () => {
    expect(await phonemize('Nice shot!')).toEqual(await theirs('Nice shot!', 'en-us'))
    await expect(phonemize('Guter Schuss!', 'de')).rejects.toThrow()
  })
})

describe('Spanish, French, Italian and Portuguese pronunciation', () => {
  const before = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'espeak-phonemes.json'), 'utf8')
  ) as Record<'es' | 'fr' | 'it' | 'pt', Record<string, string>>

  it('is what the earlier eSpeak NG build gave', async () => {
    for (const [language, lines] of Object.entries(before)) {
      for (const [text, phonemes] of Object.entries(lines)) {
        expect(await phonemizeFor(text, language as 'es'), `${language}: ${text}`).toBe(phonemes)
      }
    }
  })
})
