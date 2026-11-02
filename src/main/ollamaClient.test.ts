import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatOnce } from './ollamaClient'

afterEach(() => vi.unstubAllGlobals())

describe('chatOnce', () => {
  it('streams an answer written one line at a time', async () => {
    const lines = [
      { message: { role: 'assistant', content: 'Use ' } },
      { message: { role: 'assistant', content: 'bones.' } },
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'wiki_lookup', arguments: { topic: 'Wolf' } } }]
        }
      },
      { done: true }
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(lines.map((l) => JSON.stringify(l)).join('\n')))
    )
    const seen: string[] = []
    const message = await chatOnce('qwen', [{ role: 'user', content: 'Wolves?' }], {
      onText: (delta) => seen.push(delta)
    })
    expect(seen).toEqual(['Use ', 'bones.'])
    expect(message.content).toBe('Use bones.')
    expect(message.tool_calls).toHaveLength(1)
  })

  it('reports errors Ollama sends mid-answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"model crashed"}\n'))
    )
    await expect(
      chatOnce('qwen', [{ role: 'user', content: 'Q' }], { onText: () => undefined })
    ).rejects.toThrow('model crashed')
  })

  it('says when Ollama is not running', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    )
    await expect(chatOnce('qwen', [{ role: 'user', content: 'Q' }])).rejects.toThrow(
      /Is it running/
    )
  })
})
