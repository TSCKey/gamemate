// Pronunciation for the Kokoro voice in Spanish, French, Italian and Portuguese: eSpeak NG
// (GPL-3.0-or-later, bundled with GameMate as WebAssembly) turns the text into the phonemes
// Kokoro reads, on this computer. English is pronounced by kokoro-js itself (its generate()).
// Answers reach it already split into sentences by natural.ts (splitForSpeech, as for Supertonic).
import ESpeakNg from 'espeak-ng'
import type { LanguageCode } from '../../../shared/languages'

// eSpeak's voice per language, the ones Kokoro's own pipeline uses.
const ESPEAK_VOICES: Partial<Record<LanguageCode, string>> = {
  es: 'es',
  fr: 'fr-fr',
  it: 'it',
  pt: 'pt-br'
}

type Instantiate = (
  imports: WebAssembly.Imports,
  receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void
) => object

// The voice worker hands over eSpeak's compiled WebAssembly, so it is fetched and compiled
// once rather than for every sentence. Without it (in tests) eSpeak finds its own file.
let compiled: (() => Promise<WebAssembly.Module>) | null = null
export function setESpeakWasm(load: () => Promise<WebAssembly.Module>): void {
  let module: Promise<WebAssembly.Module> | null = null
  compiled = () => {
    module ??= load()
    module.catch(() => (module = null))
    return module
  }
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

// Kokoro's phonemes for a sentence: IPA with stress marks, clause by clause.
export async function phonemizeFor(text: string, language: LanguageCode): Promise<string> {
  // Only reaches the log: English goes to kokoro-js, and GameMate never asks Kokoro for a
  // language it doesn't speak.
  const voice = ESPEAK_VOICES[language]
  if (!voice) throw new RangeError(`lang=${language}`)
  const module = compiled ? await compiled() : null
  const instantiateWasm: Instantiate | undefined = module
    ? (imports, receive) => {
        WebAssembly.instantiate(module, imports).then((instance) => receive(instance, module))
        return {}
      }
    : undefined
  // The text goes in as a UTF-8 file (`-b 1`; written `-b=1` eSpeak reads it as 8-bit text and
  // mangles accented letters), without the ¡ and ¿ eSpeak would read out loud.
  const espeak = await ESpeakNg({
    arguments: [
      '--phonout', 'generated', '-q', '-b', '1', '--ipa=3', '--sep=', '-v', voice, '-f', 'input.txt'
    ], // prettier-ignore
    preRun: [
      (m: ESpeakModule) =>
        m.FS.writeFile('input.txt', text.replace(/[¡¿]/g, ''), { encoding: 'utf8' })
    ],
    print: () => {},
    printErr: () => {},
    ...(instantiateWasm ? { instantiateWasm } : {})
  })
  return espeak.FS.readFile('generated', { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim().replace(/_/g, ''))
    .filter(Boolean)
    .join(' ')
}

interface ESpeakModule {
  FS: {
    writeFile: (path: string, data: string, options: { encoding: 'utf8' }) => void
    readFile: (path: string, options: { encoding: 'utf8' }) => string
  }
}
