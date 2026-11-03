import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmReply } from '../src/main/ai/llm'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-answers-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('koffi', () => ({ default: {} }))

// A stand-in AI: each call returns the next scripted reply, and the messages it got are kept.
const replies: LlmReply[] = []
const seen: { role: string; content: string }[][] = []
vi.mock('../src/main/ai/llm', () => ({
  complete: async (_engine: unknown, messages: { role: string; content: string }[]) => {
    seen.push(messages)
    return replies.shift() ?? { content: '', toolCalls: [] }
  }
}))
// A stand-in Google search.
const searches: string[] = []
vi.mock('../src/main/ai/gemini', () => ({
  searchWeb: async (_key: string, _model: string, query: string) => {
    searches.push(query)
    return {
      text: 'Tank: Hazard. Damage: Sojourn. Support: Juno.',
      sources: [
        {
          title: 'reddit.com',
          url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/r'
        }
      ],
      suggestions: '<div>chips</div>'
    }
  }
}))

const { ask, isNonAnswer, noAnswer, webSearchQuery } = await import('../src/main/ai/assistant')

const ctx = {
  engine: { provider: 'builtin' as const, model: 'test' },
  game: { name: 'Hollow Knight: Silksong' },
  webLookup: false
}
const question = [{ role: 'user' as const, content: 'How do I beat Last Judge?' }]

beforeEach(() => {
  replies.length = 0
  seen.length = 0
  searches.length = 0
})

describe('replies that are not answers', () => {
  it('recognizes tool calls written out and repeated search queries', () => {
    expect(isNonAnswer('')).toBe(true)
    expect(isNonAnswer('{"name": "web_search", "arguments": {"query": "x"}}')).toBe(true)
    expect(isNonAnswer('web_search(query="Silksong Last Judge tips")')).toBe(true)
    expect(isNonAnswer('<function=web_search>\n<parameter=query>x')).toBe(true)
    expect(isNonAnswer('"Silksong Last Judge tips"', ['Silksong Last Judge tips'])).toBe(true)
  })

  it('keeps real answers, even short ones about the same topic', () => {
    expect(isNonAnswer('Dodge his dive, then strike twice.', ['Last Judge'])).toBe(false)
    expect(isNonAnswer('No, foxes can’t be tamed.')).toBe(false)
  })
})

describe('when the AI has no answer', () => {
  it('says so instead of showing its search query', async () => {
    replies.push({ content: 'web_search("Silksong Last Judge tips")', toolCalls: [] })
    const reply = await ask(ctx, question)
    expect(reply.content).toBe(noAnswer())
  })

  it('says so when it keeps looking things up', async () => {
    for (let i = 0; i < 4; i++) {
      replies.push({
        content: '',
        toolCalls: [{ name: 'wiki_lookup', arguments: { topic: 'Last Judge' } }]
      })
    }
    // The last round has no tools; the model writes the topic it wanted.
    replies.push({ content: 'Last Judge', toolCalls: [] })
    const reply = await ask(ctx, question)
    expect(reply.content).toBe(noAnswer())
  })

  it('passes real answers through', async () => {
    replies.push({ content: 'Dodge his dive, then strike twice.', toolCalls: [] })
    expect((await ask(ctx, question)).content).toBe('Dodge his dive, then strike twice.')
  })
})

describe('questions about what is current', () => {
  it('get a web search query made from their key words', () => {
    expect(
      webSearchQuery('What are the characters currently in meta in Overwatch?', 'Overwatch')
    ).toBe('characters currently meta overwatch')
    expect(webSearchQuery('Who is meta right now?', 'Overwatch')).toBe('Overwatch meta right now')
    expect(webSearchQuery('Best build for Hornet?', 'Hollow Knight: Silksong')).toBe(
      'Hollow Knight: Silksong best build hornet'
    )
    expect(webSearchQuery('How do I make a bed?', 'Minecraft')).toBeNull()
  })

  it('are searched before the AI answers, and the answer shows what was used', async () => {
    replies.push({ content: 'Hazard, Sojourn and Juno are strong right now.', toolCalls: [] })
    const reply = await ask(
      { ...ctx, game: { name: 'Overwatch' }, search: { apiKey: 'key', model: 'gemini-test' } },
      [{ role: 'user', content: 'What are the characters currently in meta in Overwatch?' }]
    )
    expect(searches).toEqual(['characters currently meta overwatch'])
    expect(JSON.stringify(seen[0])).toContain('Tank: Hazard')
    expect(reply.sources?.[0].wiki).toBe('Google Search')
    expect(reply.searchSuggestions).toBe('<div>chips</div>')
  })

  it('are not searched without web search turned on', async () => {
    replies.push({ content: 'Probably Hazard.', toolCalls: [] })
    await ask({ ...ctx, game: { name: 'Overwatch' } }, [
      { role: 'user', content: 'Who is meta right now?' }
    ])
    expect(searches).toEqual([])
  })
})
