import { beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in voice worker: answers each sentence with as many samples as it has letters, so
// a sentence of only punctuation comes back silent, as Kokoro's worker does.
const asked: string[] = []
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage(message: { id: number; text: string }): void {
    asked.push(message.text)
    const samples = new Float32Array(message.text.replace(/[^\p{L}]/gu, '').length)
    setTimeout(() =>
      this.onmessage?.({ data: { type: 'audio', id: message.id, samples, rate: 24000 } })
    )
  }
  terminate(): void {
    // nothing to free
  }
}

// Audio that "plays" at once; a buffer of no frames throws, as in the browser.
const played: number[] = []
class FakeAudioContext {
  destination = {}
  createBuffer(_channels: number, length: number): object {
    if (length === 0) throw new Error('NotSupportedError: frames must be > 0')
    played.push(length)
    return { copyToChannel: () => {} }
  }
  createGain(): object {
    return { gain: { value: 1 }, connect: (to: unknown) => to }
  }
  createBufferSource(): object {
    const source = {
      buffer: null,
      onended: null as null | (() => void),
      connect: (to: { connect?: unknown }) => to,
      start: () => setTimeout(() => source.onended?.()),
      stop: () => {}
    }
    return source
  }
} // prettier-ignore

vi.stubGlobal('Worker', FakeWorker)
vi.stubGlobal('AudioContext', FakeAudioContext)
const { say } = await import('../src/renderer/src/voice/natural')

describe('the natural voice in the pop-up window', () => {
  beforeEach(() => {
    asked.length = 0
    played.length = 0
  })

  it('skips a sentence of only punctuation and says the rest of the answer', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await say({
      engine: 'kokoro',
      text: '¡Buen tiro! !!! ... Ese jefe no lo vio venir.',
      voice: 'ef_dora',
      speed: 1,
      volume: 1,
      language: 'es'
    })
    expect(asked).toEqual(['¡Buen tiro!', '!!!', '...', 'Ese jefe no lo vio venir.'])
    expect(played).toEqual([8, 19])
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
}) // prettier-ignore
