import { describe, expect, it } from 'vitest'
import { phonemizeFor } from '../src/renderer/src/voice/kokoroText'

const spaced = (text: string): string => text.replace(/\s+/g, ' ').trim()

// eSpeak's full build runs here as it does in the voice worker: WebAssembly, text in a file.
describe('Kokoro’s pronunciation through eSpeak', () => {
  it('reads Spanish, without the opening ¡', async () => {
    expect(spaced(await phonemizeFor('¡Buen tiro! Ese jefe no lo vio venir.', 'es'))).toBe(
      'bwˈen tˈiɾo ˈese xˈefe nˈo lo βjˈo βenˈiɾ'
    )
  })

  it('reads French', async () => {
    expect(await phonemizeFor("Joli tir ! Ce boss ne l'a pas vu venir.", 'fr')).toContain('ʒolˈi')
  })

  it('reads Italian and Brazilian Portuguese', async () => {
    expect(await phonemizeFor('Bel colpo!', 'it')).toMatch(/kˈolpo/)
    expect(await phonemizeFor('Belo tiro!', 'pt')).toMatch(/tʃˈiɾ|tˈiɾ/)
  })

  it('takes accented letters as written (UTF-8)', async () => {
    expect(spaced(await phonemizeFor('¿Qué pasó?', 'es'))).toBe('kˈe pasˈo')
    expect(await phonemizeFor('C’était génial.', 'fr')).toMatch(/ʒenjˈal/)
  })

  it('refuses a language Kokoro doesn’t speak', async () => {
    await expect(phonemizeFor('Guter Schuss!', 'de')).rejects.toThrow()
    await expect(phonemizeFor('बढ़िया!', 'hi')).rejects.toThrow()
  })

  it('leaves English to kokoro-js itself', async () => {
    await expect(phonemizeFor('Nice shot!', 'en')).rejects.toThrow(RangeError)
  })
})
