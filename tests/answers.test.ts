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

// A stand-in AI: each call returns the next scripted reply.
const replies: LlmReply[] = []
vi.mock('../src/main/ai/llm', () => ({
  complete: async (): Promise<LlmReply> => replies.shift() ?? { content: '', toolCalls: [] }
}))

const { ask, isNonAnswer, NO_ANSWER } = await import('../src/main/ai/assistant')

const ctx = {
  engine: { provider: 'builtin' as const, model: 'test' },
  game: { name: 'Hollow Knight: Silksong' },
  webLookup: false
}
const question = [{ role: 'user' as const, content: 'How do I beat Last Judge?' }]

beforeEach(() => {
  replies.length = 0
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
    expect(reply.content).toBe(NO_ANSWER)
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
    expect(reply.content).toBe(NO_ANSWER)
  })

  it('passes real answers through', async () => {
    replies.push({ content: 'Dodge his dive, then strike twice.', toolCalls: [] })
    expect((await ask(ctx, question)).content).toBe('Dodge his dive, then strike twice.')
  })
})
