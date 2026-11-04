import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-gemini-speed-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

const gemini = await import('../src/main/ai/gemini')
const { complete } = await import('../src/main/ai/llm')
const { isUnreachable } = await import('../src/main/ai/engines')

afterEach(() => {
  vi.unstubAllGlobals()
  gemini.setTimings({ retryMs: 1500, idleMs: 45_000 })
})

// A server-sent event stream like Gemini's streamGenerateContent?alt=sse, one chunk at a time.
function sse(chunks: object[], { stallAfter }: { stallAfter?: number } = {}): Response {
  const encoder = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stallAfter !== undefined && i >= stallAfter) return new Promise(() => {})
      if (i >= chunks.length) return controller.close()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunks[i++])}\r\n\r\n`))
    }
  })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}
const chunk = (parts: object[], extra: object = {}): object => ({
  candidates: [{ content: { role: 'model', parts }, ...extra }]
})
const engine = { provider: 'gemini' as const, model: 'gemini-3.5-flash-lite', apiKey: 'key' }
const ask = [{ role: 'user' as const, content: 'How do I beat the Ender Dragon?' }]

describe('Gemini answers', () => {
  it('are shown while Gemini writes them, keeping every part for the next turn', async () => {
    const fetch = vi.fn(async () =>
      sse([
        chunk([{ text: 'Destroy the ' }]),
        chunk([{ text: 'crystals first.' }]),
        chunk([{ text: '', thoughtSignature: 'sig' }], { finishReason: 'STOP' })
      ])
    )
    vi.stubGlobal('fetch', fetch)
    const written: string[] = []
    const reply = await complete(engine, ask, { onText: (d) => written.push(d) })
    expect(written).toEqual(['Destroy the ', 'crystals first.'])
    expect(reply.content).toBe('Destroy the crystals first.')
    expect((reply.raw as { parts: object[] }).parts).toEqual([
      { text: 'Destroy the ' },
      { text: 'crystals first.' },
      { text: '', thoughtSignature: 'sig' }
    ])
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain(
      'models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse'
    )
  })

  it('stream tool calls too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          chunk([
            {
              functionCall: { name: 'wiki_lookup', args: { topic: 'Ender Dragon' } },
              thoughtSignature: 's'
            }
          ])
        ])
      )
    )
    const reply = await complete(engine, ask, { onText: () => {} })
    expect(reply.toolCalls).toEqual([
      { id: undefined, name: 'wiki_lookup', arguments: { topic: 'Ender Dragon' } }
    ])
  })

  it('give up when Gemini goes silent, not after a fixed total time', async () => {
    gemini.setTimings({ retryMs: 1, idleMs: 50 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const response = sse([chunk([{ text: 'Destroy the ' }])], { stallAfter: 1 })
        init.signal?.addEventListener('abort', () => undefined)
        return response
      })
    )
    const error = await complete(engine, ask, { onText: () => {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(isUnreachable(error)).toBe(true)
  })

  it('think at a low level on Gemini 3 and later, so they start sooner', async () => {
    const fetch = vi.fn(async () => sse([chunk([{ text: 'Hi.' }])]))
    vi.stubGlobal('fetch', fetch)
    await complete(engine, ask, { onText: () => {} })
    await complete({ ...engine, model: 'gemini-2.5-flash' }, ask, { onText: () => {} })
    const body = (i: number): { generationConfig?: object } =>
      JSON.parse(((fetch.mock.calls[i] as unknown[])[1] as RequestInit).body as string)
    expect(body(0).generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'low' } })
    expect(body(1).generationConfig).toBeUndefined()
  })
})

describe('When Google is overloaded', () => {
  it('Gemini is asked once more after a short wait', async () => {
    gemini.setTimings({ retryMs: 1, idleMs: 45_000 })
    const busy = (): Response =>
      Response.json(
        { error: { message: 'This model is currently experiencing high demand.' } },
        { status: 503 }
      )
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => busy())
      .mockImplementationOnce(async () => sse([chunk([{ text: 'Here you go.' }])]))
    vi.stubGlobal('fetch', fetch)
    const reply = await complete(engine, ask, { onText: () => {} })
    expect(reply.content).toBe('Here you go.')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('counts as unreachable when it stays busy, so Auto mode asks the built-in AI', async () => {
    gemini.setTimings({ retryMs: 1, idleMs: 45_000 })
    const fetch = vi.fn(async () =>
      Response.json({ error: { message: 'high demand' } }, { status: 503 })
    )
    vi.stubGlobal('fetch', fetch)
    const error = await complete(engine, ask, {}).catch((e: unknown) => e)
    expect(isUnreachable(error)).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('Web search after its free quota is used up', () => {
  it('pauses after Google says no, instead of trying on every question', async () => {
    const fetch = vi.fn(async () => Response.json({ error: { message: 'quota' } }, { status: 429 }))
    vi.stubGlobal('fetch', fetch)
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).rejects.toThrow()
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('resets at midnight Pacific time, when Google renews free quotas', () => {
    // 06:00 UTC on 4 November is 22:00 the day before in California (PST, UTC−8).
    expect(gemini.nextQuotaReset(new Date('2026-11-04T06:00:00Z')).toISOString()).toBe(
      '2026-11-04T08:00:00.000Z'
    )
    // In summer (PDT, UTC−7) midnight is 07:00 UTC.
    expect(gemini.nextQuotaReset(new Date('2026-07-01T12:00:00Z')).toISOString()).toBe(
      '2026-07-02T07:00:00.000Z'
    )
  })
})

describe('Fixes from the review', () => {
  it('count a connection lost mid-answer as unreachable, so Auto mode can answer instead', async () => {
    const encoder = new TextEncoder()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk([{ text: 'Destroy the ' }]))}\r\n\r\n`)
            )
            controller.error(new TypeError('terminated'))
          }
        })
        return new Response(body)
      })
    )
    const error = await complete(engine, ask, { onText: () => {} }).catch((e: unknown) => e)
    expect(isUnreachable(error)).toBe(true)
    expect((error as Error).message).toBe('Could not reach Gemini. Check your internet connection.')
  })

  it('answer without the low thinking level when a model refuses it', async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () =>
        Response.json(
          { error: { message: 'Thinking level is not supported for this model.' } },
          { status: 400 }
        )
      )
      .mockImplementationOnce(async () => sse([chunk([{ text: 'Here you go.' }])]))
    vi.stubGlobal('fetch', fetch)
    const reply = await complete(engine, ask, { onText: () => {} })
    expect(reply.content).toBe('Here you go.')
    const second = JSON.parse(((fetch.mock.calls[1] as unknown[])[1] as RequestInit).body as string)
    expect(second.generationConfig).toBeUndefined()
  })
})

describe('Web search when Google says "too many requests"', () => {
  const tooMany = (quotaId: string, retryDelay?: string): Response =>
    Response.json(
      {
        error: {
          message: 'Quota exceeded',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              violations: [{ quotaId }]
            },
            ...(retryDelay
              ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }]
              : [])
          ]
        }
      },
      { status: 429 }
    )
  const found = (): Response =>
    Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })

  afterEach(() => {
    vi.useRealTimers()
    gemini.resumeWebSearch()
  })

  it('waits only as long as Google asks after a per-minute limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'))
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () =>
        tooMany('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '30s')
      )
      .mockImplementation(async () => found())
    vi.stubGlobal('fetch', fetch)
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).rejects.toThrow()
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-11-04T10:00:31Z'))
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).resolves.toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('waits for the reset at midnight Pacific after the daily limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'))
    const fetch = vi.fn(async () =>
      tooMany('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '20s')
    )
    vi.stubGlobal('fetch', fetch)
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).rejects.toThrow()
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
    await expect(gemini.searchWeb('key', 'gemini-3.5-flash', 'meta')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(gemini.webSearchPaused()).toBe(true)
  })
})
