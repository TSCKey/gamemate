import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

// While web search is paused (its quota is used up), the AI isn't offered the web_search tool,
// so it doesn't spend a round on a search that can only fail.
const userData = mkdtempSync(join(tmpdir(), 'gamemate-search-tool-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('koffi', () => ({ default: {} }))
const offered = vi.hoisted(() => [] as string[][])
vi.mock('../src/main/ai/llm', () => ({
  complete: async (
    _engine: unknown,
    _messages: unknown,
    options: { tools?: { name: string }[] }
  ) => {
    offered.push((options.tools ?? []).map((tool) => tool.name))
    return { content: 'Play the game.', toolCalls: [] }
  }
}))
vi.mock('../src/main/ai/gemini', () => ({
  searchWeb: async () => {
    throw new Error('paused')
  },
  webSearchPaused: () => true
}))

const { ask } = await import('../src/main/ai/assistant')

describe('the web search tool', () => {
  it('is not offered while web search is paused', async () => {
    await ask(
      {
        engine: { provider: 'gemini', model: 'gemini-3.5-flash', apiKey: 'key' },
        game: { name: 'Overwatch' },
        webLookup: false,
        search: { apiKey: 'key', model: 'gemini-3.5-flash' }
      },
      [{ role: 'user', content: 'Who is meta right now?' }]
    )
    expect(offered[0]).not.toContain('web_search')
  })
})
