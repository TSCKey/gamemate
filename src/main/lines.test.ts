import { describe, expect, it } from 'vitest'
import { forEachLine } from './lines'

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      }
      controller.close()
    }
  })
}

async function lines(chunks: (string | Uint8Array)[]): Promise<string[]> {
  const out: string[] = []
  await forEachLine(streamOf(chunks), (line) => out.push(line))
  return out
}

describe('forEachLine', () => {
  it('joins lines split across chunks and skips blank ones', async () => {
    expect(await lines(['data: one\n\nda', 'ta: two\r\n', '\n'])).toEqual([
      'data: one',
      'data: two'
    ])
  })

  it('keeps a last line without a newline', async () => {
    expect(await lines(['{"a":1}\n{"b":', '2}'])).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('decodes characters split between chunks', async () => {
    const bytes = new TextEncoder().encode('café ⛏\n')
    expect(await lines([bytes.slice(0, 4), bytes.slice(4, 8), bytes.slice(8)])).toEqual(['café ⛏'])
  })
})
