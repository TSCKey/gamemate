// Large downloads (the AI engine and models): resumable, and only kept when their size and
// SHA-256 checksum match the pinned values.
import { net } from 'electron'
import { createHash, type Hash } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'

export interface DownloadSpec {
  url: string
  size: number
  sha256: string
}

// Partial downloads are kept next to the destination so a failed download can continue.
export const partialPath = (dest: string): string => `${dest}.part`

async function hashFile(file: string, hash: Hash): Promise<void> {
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
}

// Downloads `spec` to `dest`. Reports progress as byte deltas (negative when a download has to
// start over), and throws if the result doesn't match the expected size and checksum.
export async function downloadVerified(
  spec: DownloadSpec,
  dest: string,
  onBytes: (delta: number) => void,
  signal: AbortSignal
): Promise<void> {
  const part = partialPath(dest)
  await mkdir(dirname(dest), { recursive: true })
  let hash = createHash('sha256')
  let have = (await stat(part).catch(() => null))?.size ?? 0
  if (have > spec.size) {
    await rm(part, { force: true })
    have = 0
  }
  if (have > 0) {
    // Re-read what is already there so the final checksum covers the whole file.
    await hashFile(part, hash)
    onBytes(have)
  }

  if (have < spec.size) {
    const res = await net.fetch(spec.url, {
      headers: have > 0 ? { Range: `bytes=${have}-` } : {},
      signal
    })
    if (!res.ok || !res.body) throw new Error(`the server answered ${res.status}`)
    if (have > 0 && res.status !== 206) {
      // The server sent the whole file instead of the rest: start over.
      onBytes(-have)
      have = 0
      hash = createHash('sha256')
    }
    const tap = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk)
        onBytes(chunk.length)
        done(null, chunk)
      }
    })
    await pipeline(
      Readable.fromWeb(res.body as import('stream/web').ReadableStream),
      tap,
      createWriteStream(part, { flags: have > 0 ? 'a' : 'w' }),
      { signal }
    )
  }

  if ((await stat(part)).size !== spec.size) throw new Error('the download is incomplete')
  if (hash.digest('hex') !== spec.sha256) {
    await rm(part, { force: true })
    throw new Error('the downloaded file is damaged (checksum mismatch)')
  }
  await rename(part, dest)
}
