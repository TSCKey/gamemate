// GameMate's own eSpeak NG build (vendor/espeak-ng: eSpeak NG 1.52.0, GPL-3.0-or-later, compiled
// to WebAssembly by .github/workflows/espeak.yml), run on this computer: it works out how the
// Kokoro voice pronounces text, in every language Kokoro speaks in GameMate.
import ESpeakNG from '../../../../vendor/espeak-ng/espeak-ng.js'

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

// Runs eSpeak's command line once on the text with the voice and options, and returns what it
// wrote as phonemes, line by line (a line per clause), empty lines left out. The text goes in as
// a UTF-8 file (`-b 1`; written `-b=1` eSpeak reads it as 8-bit text and mangles accents).
export async function espeakPhonemes(
  text: string,
  voice: string,
  options: string[]
): Promise<string[]> {
  const module = compiled ? await compiled() : null
  const instantiateWasm: Instantiate | undefined = module
    ? (imports, receive) => {
        WebAssembly.instantiate(module, imports).then((instance) => receive(instance, module))
        return {}
      }
    : undefined
  const espeak = await ESpeakNG({
    arguments: [
      '--phonout',
      'generated',
      '-q',
      '-b',
      '1',
      ...options,
      '-v',
      voice,
      '-f',
      'input.txt'
    ],
    preRun: [(m) => m.FS.writeFile('input.txt', text, { encoding: 'utf8' })],
    print: () => {},
    printErr: () => {},
    ...(instantiateWasm ? { instantiateWasm } : {})
  })
  return espeak.FS.readFile('generated', { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0)
}
