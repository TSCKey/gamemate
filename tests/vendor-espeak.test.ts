// @vitest-environment node
// GameMate's own eSpeak NG build (vendor/espeak-ng): compiled from a pinned release by
// .github/workflows/espeak.yml, committed with the hashes of what it produced.
import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'

const DIR = join(__dirname, '..', 'vendor', 'espeak-ng')
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as {
  version: string
  commit: string
  emscripten: string
  files: Record<string, string>
}

describe('the bundled eSpeak NG build', () => {
  it('is eSpeak NG 1.52.0 and matches its manifest', () => {
    expect(manifest.version).toBe('1.52.0')
    expect(manifest.commit).toBe('4870adfa25b1a32b4361592f1be8a40337c58d6c')
    expect(manifest.emscripten).toMatch(/^\d+\.\d+\.\d+$/)
    expect(Object.keys(manifest.files).sort()).toEqual(['espeak-ng.js', 'espeak-ng.wasm'])
    for (const [name, sha256] of Object.entries(manifest.files)) {
      const hash = createHash('sha256')
        .update(readFileSync(join(DIR, name)))
        .digest('hex')
      expect(hash, name).toBe(sha256)
    }
  })

  it('turns Spanish text into phonemes on this computer', async () => {
    const { default: ESpeakNG } = await import(pathToFileURL(join(DIR, 'espeak-ng.js')).href)
    const espeak = await ESpeakNG({
      arguments: ['--phonout', 'out', '-q', '-b', '1', '--ipa=3', '--sep=', '-v', 'es', '-f', 'in'],
      preRun: [
        (m: { FS: { writeFile: (p: string, d: string) => void } }) =>
          m.FS.writeFile('in', 'Buen tiro')
      ],
      print: () => {},
      printErr: () => {}
    })
    expect(espeak.FS.readFile('out', { encoding: 'utf8' })).toContain('tˈiɾo')
  })
})
