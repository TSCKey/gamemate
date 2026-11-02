import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatCompletion, toOpenAiMessages } from './llamaClient'

const server = { url: 'http://127.0.0.1:1', apiKey: 'key' }

function sse(events: object[]): Response {
  const body = [...events.map((e) => `data: ${JSON.stringify(e)}\n\n`), 'data: [DONE]\n\n'].join('')
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

// The JSON body of the request a fake fetch received.
function sent(fetch: { mock: { calls: unknown[][] } }, call: number): Record<string, unknown> {
  return JSON.parse((fetch.mock.calls[call][1] as RequestInit).body as string)
}

afterEach(() => vi.unstubAllGlobals())

describe('toOpenAiMessages', () => {
  it('keeps one system message first and attaches later context to the next question', () => {
    const out = toOpenAiMessages([
      { role: 'system', content: 'You are GameMate.' },
      { role: 'system', content: 'Observations.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'system', content: 'Recipe data.' },
      { role: 'user', content: 'Craft a piston?' }
    ])
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(out[0].content).toBe('You are GameMate.\n\nObservations.')
    expect(out[3].content).toBe('Recipe data.\n\nCraft a piston?')
  })

  it('sends screenshots as image parts', () => {
    const [message] = toOpenAiMessages([
      { role: 'user', content: 'What is this?', images: ['AAA'] }
    ])
    expect(message.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
      { type: 'text', text: 'What is this?' }
    ])
  })
})

describe('chatCompletion', () => {
  it('streams text and puts tool calls back together', async () => {
    const fetch = vi.fn(async () =>
      sse([
        { choices: [{ delta: { reasoning_content: 'Hmm.' } }] },
        { choices: [{ delta: { content: 'Let me ' } }] },
        { choices: [{ delta: { content: 'check.' } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'c1', function: { name: 'wiki_lookup', arguments: '{"to' } }
                ]
              }
            }
          ]
        },
        {
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: 'pic":"Wolf"}' } }] } }
          ]
        }
      ])
    )
    vi.stubGlobal('fetch', fetch)
    const seen: string[] = []
    const reply = await chatCompletion(server, [{ role: 'user', content: 'Wolves?' }], {
      onText: (delta) => seen.push(delta)
    })
    expect(seen).toEqual(['Let me ', 'check.'])
    expect(reply.content).toBe('Let me check.')
    expect(reply.toolCalls).toEqual([
      { id: 'c1', name: 'wiki_lookup', arguments: { topic: 'Wolf' } }
    ])
    expect(reply.raw).toEqual({ reasoning_content: 'Hmm.' })
    expect(sent(fetch, 0).stream).toBe(true)
  })

  it('asks again without thinking when the answer stayed in the thinking', async () => {
    const replies = [
      { choices: [{ message: { content: '', reasoning_content: 'all of it' } }] },
      { choices: [{ message: { content: 'Answer.' } }] }
    ]
    const fetch = vi.fn(async () => Response.json(replies.shift()))
    vi.stubGlobal('fetch', fetch)
    const reply = await chatCompletion(server, [{ role: 'user', content: 'Q' }])
    expect(reply.content).toBe('Answer.')
    expect(sent(fetch, 1).chat_template_kwargs).toEqual({
      enable_thinking: false
    })
  })

  it('explains a conversation that no longer fits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { message: 'the request exceeds the available context size' } },
          { status: 400 }
        )
      )
    )
    await expect(chatCompletion(server, [{ role: 'user', content: 'Q' }])).rejects.toThrow(
      /too long for the built-in AI/
    )
  })
})
