import { createHash } from 'crypto'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { checkFile } from '../src/main/voice/checksum'

const dir = mkdtempSync(join(tmpdir(), 'gamemate-checksum-'))
const bytes = Buffer.from('GameMate model file')
const sha256 = createHash('sha256').update(bytes).digest('hex')

describe('downloaded model files', () => {
  it('accept the right size and hash and reject a changed file', async () => {
    const file = join(dir, 'model.onnx')
    writeFileSync(file, bytes)
    expect(await checkFile(file, { size: bytes.length, sha256 })).toBe(true)

    const changed = Buffer.from(bytes)
    changed[0] ^= 1
    writeFileSync(file, changed)
    expect(await checkFile(file, { size: bytes.length, sha256 })).toBe(false)
    // Without a hash only the size is checked.
    expect(await checkFile(file, { size: bytes.length })).toBe(true)
    expect(await checkFile(file, { size: bytes.length + 1 })).toBe(false)
  })

  it('reject a file that is missing', async () => {
    expect(await checkFile(join(dir, 'missing.onnx'), { size: 1 })).toBe(false)
  })
})
