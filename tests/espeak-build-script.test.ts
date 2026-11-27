// The build script is attached to every release next to eSpeak NG's source archive, which has
// no git history, so it has to run without one.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const script = readFileSync(join(__dirname, '..', 'scripts', 'espeak', 'build.sh'), 'utf8')
const workflow = readFileSync(join(__dirname, '..', '.github', 'workflows', 'espeak.yml'), 'utf8')

describe('the eSpeak NG build script', () => {
  it('runs on the source archive, without git', () => {
    expect(script).not.toMatch(/\$\(git rev-parse HEAD\)"/)
    expect(script).toContain('ESPEAK_COMMIT')
  })

  it('is explained in a README packed with it', () => {
    const readme = readFileSync(join(__dirname, '..', 'scripts', 'espeak', 'README.md'), 'utf8')
    expect(readme).toContain('3.1.50')
    expect(readme).toContain('build.sh')
  })

  it('uses a pinned emsdk', () => {
    expect(workflow).toMatch(/checkout "?\$EMSCRIPTEN_VERSION"?/)
  })
})
