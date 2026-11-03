// Checks a downloaded model file against the size and sha256 Hugging Face lists for it.
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { pipeline } from 'stream/promises'

export async function checkFile(
  path: string,
  expected: { size?: number; sha256?: string }
): Promise<boolean> {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) return false
  if (expected.size !== undefined && info.size !== expected.size) return false
  if (!expected.sha256) return true
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex') === expected.sha256
}
