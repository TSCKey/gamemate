// GameMate's own eSpeak NG build stands in for the phonemizer package inside kokoro-js. If
// kokoro-js stopped importing it by name, or the alias went away, the phonemizer package (and its
// own eSpeak NG build) would be bundled again without any other test noticing.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const read = (...path: string[]): string => readFileSync(join(root, ...path), 'utf8')

describe('kokoro-js’s English pronunciation', () => {
  it('is imported from the phonemizer package by name', () => {
    const exported = JSON.parse(read('node_modules', 'kokoro-js', 'package.json')).exports.default
    expect(read('node_modules', 'kokoro-js', exported)).toMatch(/from\s*["']phonemizer["']/)
  })

  it('is pointed at GameMate’s own build in the app', () => {
    expect(read('electron.vite.config.ts')).toMatch(
      /phonemizer:\s*resolve\('src\/renderer\/src\/voice\/englishPhonemes\.ts'\)/
    )
  })
})
