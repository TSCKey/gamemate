import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Stopping an answer with ■: without Electron, with a stand-in AI that only ends when stopped.
const userData = mkdtempSync(join(tmpdir(), 'gamemate-stop-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('koffi', () => ({ default: {} }))
const calls = vi.hoisted(() => [] as { signal?: AbortSignal }[])
vi.mock('../src/main/ai/llm', () => ({
  complete: (_engine: unknown, _messages: unknown, options: { signal?: AbortSignal }) => {
    calls.push(options)
    return new Promise((_resolve, reject) =>
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason))
    )
  }
}))

const { ask } = await import('../src/main/ai/assistant')
const { endAnswer, startAnswer, stopAnswer, StoppedError } = await import('../src/main/ai/stop')
const { isUnreachable } = await import('../src/main/ai/engines')

const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
}

describe('stopping an answer', () => {
  it('ends the question at once and asks the AI nothing more', async () => {
    const signal = startAnswer('window-1:1')
    const answer = ask(
      {
        engine: { provider: 'builtin', model: 'test' },
        game: { name: 'Silksong' },
        webLookup: false,
        signal
      },
      [{ role: 'user', content: 'How do I beat the Last Judge?' }]
    )
    await until(() => calls.length > 0)
    expect(calls[0].signal).toBe(signal)

    stopAnswer('window-1:1')
    const error = await answer.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StoppedError)
    // A stop is not "the AI is unreachable", so Auto mode doesn't ask the other AI.
    expect(isUnreachable(error)).toBe(false)
    expect(calls).toHaveLength(1)
    endAnswer('window-1:1')
  })

  it('only stops the question it was asked for, and not after it ended', () => {
    const first = startAnswer('window-1:2')
    const second = startAnswer('window-2:2')
    stopAnswer('window-2:2')
    expect(first.aborted).toBe(false)
    expect(second.aborted).toBe(true)
    endAnswer('window-1:2')
    stopAnswer('window-1:2')
    expect(first.aborted).toBe(false)
  })

  it('doesn’t start a question that was already stopped', async () => {
    calls.length = 0
    const signal = startAnswer('window-1:3')
    stopAnswer('window-1:3')
    const error = await ask(
      {
        engine: { provider: 'builtin', model: 'test' },
        game: { name: 'Silksong' },
        webLookup: false,
        signal
      },
      [{ role: 'user', content: 'How do I beat the Last Judge?' }]
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StoppedError)
    expect(calls).toHaveLength(0)
  })
})

describe('the AI connections', () => {
  afterEach(() => vi.unstubAllGlobals())
  // A stand-in network that, like the real one, gives up when the request's signal aborts.
  const network = (): void => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          if (init.signal?.aborted) reject(init.signal.reason)
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
    )
  }

  it('close the request when the player stops, for every AI', async () => {
    network()
    const { chatCompletion } = await import('../src/main/ai/llamaClient')
    const { chatOnce } = await import('../src/main/ai/ollamaClient')
    const { generate } = await import('../src/main/ai/gemini')
    for (const request of [
      (signal: AbortSignal) =>
        chatCompletion({ url: 'http://127.0.0.1:1', apiKey: 'k' } as never, [], { signal }),
      (signal: AbortSignal) => chatOnce('qwen', [], { signal, onText: () => {} }),
      (signal: AbortSignal) => generate('key', 'gemini-test', { contents: [] }, signal)
    ]) {
      const signal = startAnswer('window-9:1')
      const pending = request(signal).catch((e: unknown) => e)
      stopAnswer('window-9:1')
      const error = await pending
      expect(error).toBeInstanceOf(StoppedError)
      expect(isUnreachable(error)).toBe(false)
      endAnswer('window-9:1')
    }
  })
})
