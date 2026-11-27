// Stands in for the `phonemizer` package that kokoro-js imports to pronounce English
// (electron.vite.config.ts points the import here), so the only eSpeak NG in GameMate is its own
// build. Same answer as phonemizer 1.2.1: eSpeak's IPA, a string per clause. kokoro-js still does
// its own English clean-up (numbers, money, "Dr.") around it.
import { espeakPhonemes } from './espeak'

// The English voices kokoro-js asks for: American ('en-us') and British ('en').
const ENGLISH = new Set(['en-us', 'en', 'en-gb'])

export async function phonemize(text: string, language = 'en-us'): Promise<string[]> {
  // Only reaches the log: kokoro-js only asks for English.
  if (!ENGLISH.has(language)) throw new RangeError(`lang=${language}`)
  return espeakPhonemes(text, language, ['--ipa'])
}
