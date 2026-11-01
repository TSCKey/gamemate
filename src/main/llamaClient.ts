// Talks to the built-in engine (llama.cpp's llama-server) through its OpenAI-compatible
// chat API. Kept free of Electron so it can be tested against a running server directly.
import type { LlmMessage, LlmOptions, LlmReply, LlmToolCall } from './llm'

const TIMEOUT_MS = 180_000
// Room for thinking plus the answer; quick background checks get much less.
const MAX_TOKENS = 4096
const MAX_TOKENS_FAST = 512
// Free-text fields in structured replies, so a small model can't ramble until the context fills.
const MAX_STRING_LENGTH = 400
// Qwen's recommended sampling for thinking and non-thinking replies (every catalog model is Qwen).
const SAMPLING = { temperature: 0.6, top_p: 0.95, top_k: 20, min_p: 0 }
const SAMPLING_FAST = { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0 }

export interface EngineServer {
  url: string
  apiKey: string
}

type ContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

interface OpenAiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[] | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
  reasoning_content?: string
}

interface CompletionResponse {
  choices?: {
    message?: {
      content?: string | null
      reasoning_content?: string | null
      tool_calls?: OpenAiToolCall[]
    }
  }[]
  error?: { message?: string }
}

export function toOpenAiMessages(messages: LlmMessage[]): OpenAiMessage[] {
  // Chat templates such as Qwen's only accept one system message, at the start. The opening
  // instructions go there; context added later (like a looked-up recipe) is attached to the
  // question that follows it, so it stays right next to it.
  const firstOther = messages.findIndex((m) => m.role !== 'system')
  const leading = firstOther === -1 ? messages : messages.slice(0, firstOther)
  const system = leading.map((m) => m.content)
  const out: OpenAiMessage[] = []
  let context: string[] = []
  messages.slice(leading.length).forEach((m, i) => {
    if (m.role === 'system') {
      context.push(m.content)
    } else if (m.role === 'user' && context.length) {
      out.push(convert({ ...m, content: `${context.join('\n\n')}\n\n${m.content}` }, i))
      context = []
    } else {
      out.push(convert(m, i))
    }
  })
  system.push(...context)
  return system.length ? [{ role: 'system', content: system.join('\n\n') }, ...out] : out
}

function convert(m: LlmMessage, i: number): OpenAiMessage {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content }
    case 'user':
      return m.images?.length
        ? {
            role: 'user',
            content: [
              ...m.images.map((data): ContentPart => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${data}` }
              })),
              { type: 'text', text: m.content }
            ]
          }
        : { role: 'user', content: m.content }
    case 'assistant': {
      // The model's own thinking from this turn, sent back so it can continue after a tool call.
      const reasoning = (m.raw as { reasoning_content?: unknown } | undefined)?.reasoning_content
      return {
        role: 'assistant',
        content: m.content || null,
        ...(typeof reasoning === 'string' && reasoning ? { reasoning_content: reasoning } : {}),
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c, j) => ({
                id: c.id ?? `call_${i}_${j}`,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.arguments) }
              }))
            }
          : {})
      }
    }
    case 'tool':
      return { role: 'tool', content: m.content, tool_call_id: m.callId ?? '' }
  }
}

// Adds a maximum length to every free-text string in a JSON schema.
function boundStrings(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(boundStrings)
  if (typeof schema !== 'object' || schema === null) return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) out[key] = boundStrings(value)
  if (out.type === 'string' && !('enum' in out) && !('maxLength' in out)) {
    out.maxLength = MAX_STRING_LENGTH
  }
  return out
}

function parseArguments(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text || '{}')
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function send(server: EngineServer, body: object): Promise<LlmReply> {
  let res: Response
  try {
    res = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The built-in AI took too long to respond.', { cause: error })
    }
    throw new Error('The built-in AI stopped unexpectedly. Try again.', { cause: error })
  }

  const data = (await res.json().catch(() => ({}))) as CompletionResponse
  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText
    if (/context|too long|exceed/i.test(detail)) {
      throw new Error('This conversation is too long for the built-in AI. Start a new chat.')
    }
    throw new Error(`The built-in AI failed: ${detail}`)
  }
  const message = data.choices?.[0]?.message
  const toolCalls: LlmToolCall[] = (message?.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function.name,
    arguments: parseArguments(c.function.arguments)
  }))
  return {
    content: message?.content ?? '',
    toolCalls,
    raw: message?.reasoning_content ? { reasoning_content: message.reasoning_content } : undefined
  }
}

export async function chatCompletion(
  server: EngineServer,
  messages: LlmMessage[],
  options: LlmOptions = {}
): Promise<LlmReply> {
  const body = {
    messages: toOpenAiMessages(messages),
    stream: false,
    max_tokens: options.fast ? MAX_TOKENS_FAST : MAX_TOKENS,
    ...(options.fast ? SAMPLING_FAST : SAMPLING),
    ...(options.tools?.length
      ? {
          tools: options.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters }
          }))
        }
      : {}),
    ...(options.jsonSchema
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'reply', schema: boundStrings(options.jsonSchema) }
          }
        }
      : {}),
    // Fast background calls skip the model's thinking step.
    ...(options.fast ? { chat_template_kwargs: { enable_thinking: false } } : {})
  }
  const reply = await send(server, body)
  if (!reply.content.trim() && reply.toolCalls.length === 0 && !options.fast) {
    // Small models sometimes put the whole answer in their thinking; ask again without it.
    return send(server, { ...body, chat_template_kwargs: { enable_thinking: false } })
  }
  return reply
}
