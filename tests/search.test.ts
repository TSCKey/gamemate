import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchWeb } from '../src/main/ai/gemini'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-search-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

afterEach(() => vi.unstubAllGlobals())

describe('web search through Gemini', () => {
  it('sends only the query, with Google Search turned on', async () => {
    const fetch = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [] } }] }))
    vi.stubGlobal('fetch', fetch)
    await searchWeb('key', 'gemini-test', 'Silksong Last Judge tips')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('models/gemini-test:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key')
    const body = JSON.parse(init.body as string)
    expect(body.tools).toEqual([{ googleSearch: {} }])
    expect(body.contents).toHaveLength(1)
    expect(JSON.stringify(body.contents)).toContain('Silksong Last Judge tips')
    expect(body.systemInstruction).toBeUndefined()
  })

  it('reads the summary, the pages used and the search suggestions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          candidates: [
            {
              content: {
                parts: [{ text: 'thinking…', thought: true }, { text: 'Dodge left, then strike.' }]
              },
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a',
                      title: 'reddit.com'
                    }
                  },
                  {
                    web: {
                      uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a',
                      title: 'reddit.com'
                    }
                  },
                  {
                    web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b' }
                  }
                ],
                searchEntryPoint: { renderedContent: '<div class="chips">…</div>' }
              }
            }
          ]
        })
      )
    )
    const result = await searchWeb('key', 'gemini-test', 'boss tips')
    expect(result.text).toBe('Dodge left, then strike.')
    expect(result.sources).toEqual([
      {
        title: 'reddit.com',
        url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a'
      },
      {
        title: 'vertexaisearch.cloud.google.com',
        url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b'
      }
    ])
    expect(result.suggestions).toBe('<div class="chips">…</div>')
  })
})

describe('web search consent', () => {
  it('needs Gemini, and records when it was turned on', async () => {
    const settings = await import('../src/main/system/settings')
    settings.resetSettings()
    expect(settings.updateSettings({ webSearch: true }).webSearch).toBe(false)
    const on = settings.updateSettings({ geminiConsent: true, webSearch: true })
    expect(on.webSearch).toBe(true)
    expect(Date.parse(on.consents.search ?? '')).not.toBeNaN()
    // Withdrawing Gemini also stops web search.
    const off = settings.updateSettings({ geminiConsent: false })
    expect(off.webSearch).toBe(false)
    expect(off.consents.search).toBeUndefined()
  })
})
