import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (...path: string[]): string => readFileSync(join(root, ...path), 'utf8')
const installed = (name: string): { version: string; license: string } =>
  JSON.parse(read('node_modules', name, 'package.json'))
const manifest = JSON.parse(read('vendor', 'espeak-ng', 'manifest.json')) as {
  version: string
  commit: string
  emscripten: string
}

// eSpeak NG is GPL-licensed and bundled (GameMate's own build, vendor/espeak-ng), so the
// installer carries its license and notices, and every release carries its exact source and the
// script it was built with.
describe('the third-party notices', () => {
  const notices = read('licenses', 'THIRD-PARTY-NOTICES.md')

  it('name GameMate’s eSpeak NG build exactly: version, source commit and compiler', () => {
    expect(notices).toContain(`eSpeak NG ${manifest.version}`)
    expect(notices).toContain(manifest.commit)
    expect(notices).toContain(`Emscripten ${manifest.emscripten}`)
    expect(notices).toContain(`espeak-ng-${manifest.version}-source.tar.gz`)
    expect(notices).toContain('gamemate-espeak-build.tar.gz')
  })

  it('no longer list the eSpeak NG builds GameMate replaced', () => {
    expect(notices).not.toMatch(/phonemizer|espeak-ng\.js|1\.52-dev/)
  })

  it('name kokoro-js and the Kokoro model with their license', () => {
    const { version } = installed('kokoro-js')
    expect(notices).toContain(`kokoro-js ${version}`)
    expect(notices).toContain('Apache License 2.0')
    expect(notices).toContain('Kokoro-82M')
  })

  it('come with the GPL and the Apache License', () => {
    expect(read('licenses', 'GPL-3.0.txt')).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 3/)
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
})

describe('each release', () => {
  const release = read('.github', 'workflows', 'release.yml')
  const build = read('.github', 'workflows', 'espeak.yml')

  it('attaches eSpeak NG’s source at the commit GameMate’s build came from, and the build script', () => {
    expect(release).toContain(manifest.commit)
    expect(build).toContain(`ESPEAK_COMMIT: ${manifest.commit}`)
    expect(build).toContain(`EMSCRIPTEN_VERSION: ${manifest.emscripten}`)
    expect(release).toContain(`dist/sources/espeak-ng-${manifest.version}-source.tar.gz`)
    expect(release).toContain('dist/sources/gamemate-espeak-build.tar.gz')
    expect(release).not.toContain('npm pack')
  })

  it('is described by this version’s English patch notes', () => {
    expect(release).toContain('--notes-file')
    expect(release).toContain('src/shared/patchNotes/$version/en.md')
    expect(release).not.toContain('--notes-from-tag')
  })
})
