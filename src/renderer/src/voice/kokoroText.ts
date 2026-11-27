// Pronunciation for the Kokoro voice in Spanish, French, Italian and Portuguese: GameMate's eSpeak
// NG build (./espeak.ts) turns the text into the phonemes Kokoro reads, on this computer. English
// is pronounced by kokoro-js itself (its generate()), through the same build (englishPhonemes.ts).
// Answers reach it already split into sentences by natural.ts (splitForSpeech, as for Supertonic).
import { espeakPhonemes } from './espeak'
import type { LanguageCode } from '../../../shared/languages'
export { setESpeakWasm } from './espeak'

// eSpeak's voice per language, the ones Kokoro's own pipeline uses.
const ESPEAK_VOICES: Partial<Record<LanguageCode, string>> = {
  es: 'es',
  fr: 'fr-fr',
  it: 'it',
  pt: 'pt-br'
}

// What Kokoro is given for a piece of an answer: English text as it is (kokoro-js pronounces
// it), eSpeak's phonemes for the other languages, or null when there is nothing to say: a
// piece of only punctuation ('!!!', '...') would give the model no sounds at all.
export async function kokoroInput(
  text: string,
  language: LanguageCode
): Promise<{ text: string } | { phonemes: string } | null> {
  if (!/[\p{L}\p{N}]/u.test(text)) return null
  if (language === 'en') return { text }
  const phonemes = await phonemizeFor(text, language)
  return phonemes ? { phonemes } : null
}

// Kokoro's phonemes for a sentence: IPA with stress marks, clause by clause, without the ¡ and ¿
// eSpeak would read out loud.
export async function phonemizeFor(text: string, language: LanguageCode): Promise<string> {
  // Only reaches the log: English goes to kokoro-js, and GameMate never asks Kokoro for a
  // language it doesn't speak.
  const voice = ESPEAK_VOICES[language]
  if (!voice) throw new RangeError(`lang=${language}`)
  const lines = await espeakPhonemes(text.replace(/[¡¿]/g, ''), voice, ['--ipa=3', '--sep='])
  return lines
    .map((line) => line.trim().replace(/_/g, ''))
    .filter(Boolean)
    .join(' ')
}
