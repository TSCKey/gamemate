import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (...path: string[]): string => readFileSync(join(root, ...path), 'utf8')
const installed = (name: string): { version: string; license: string } =>
  JSON.parse(read('node_modules', name, 'package.json'))

// eSpeak NG is GPL-licensed and bundled, so the installer carries its license and notices, and
// every release carries the packages it was built from.
describe('the third-party notices', () => {
  const notices = read('licenses', 'THIRD-PARTY-NOTICES.md')

  it('name every bundled package at the version GameMate is built with', () => {
    for (const name of ['espeak-ng', 'phonemizer', 'kokoro-js']) {
      const { version, license } = installed(name)
      expect(notices).toContain(`${name}-${version}.tgz`)
      expect(notices).toContain(license === 'Apache-2.0' ? 'Apache License 2.0' : license)
    }
    expect(notices).toContain('Kokoro-82M')
  })

  it('come with eSpeak NG’s own license text and the Apache License', () => {
    expect(read('licenses', 'GPL-3.0.txt')).toBe(read('node_modules', 'espeak-ng', 'LICENSE'))
    expect(read('licenses', 'Apache-2.0.txt')).toBe(read('node_modules', 'kokoro-js', 'LICENSE'))
  })

  it('are installed next to the app', () => {
    const lines = read('electron-builder.yml')
      .split('\n')
      .map((line) => line.trim())
    const from = lines.indexOf('- from: licenses')
    expect(from).toBeGreaterThan(lines.indexOf('extraResources:'))
    expect(lines[from + 1]).toBe('to: licenses')
  })

  it('point to sources each release publishes', () => {
    const release = read('.github', 'workflows', 'release.yml')
    const pack = `npm pack espeak-ng@${installed('espeak-ng').version} phonemizer@${installed('phonemizer').version}`
    expect(release).toContain(pack)
    for (const name of ['espeak-ng', 'phonemizer']) {
      expect(release).toContain(`dist/sources/${name}-${installed(name).version}.tgz`)
    }
  })
})
