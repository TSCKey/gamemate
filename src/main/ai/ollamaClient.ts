// Minimal client for the local Ollama HTTP API.
// See https://github.com/ollama/ollama/blob/main/docs/api.md

import { forEachLine } from './lines'
import type { ModelInfo } from '../../shared/types'
import { t } from '../system/i18n'
import { UnreachableError } from './errors'
export type { ModelInfo }

const OLLAMA_URL = 'http://127.0.0.1:11434'
const REQUEST_TIMEOUT_MS = 120_000

// Models GameMate has used this session, so it can free them when it quits.
const usedModels = new Set<string>()

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  // Base64-encoded images (no data: prefix) for vision models.
  images?: string[]
}

export interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> }
}

// A message as Ollama sends and receives it, including tool calls and tool results.
export interface OllamaMessage {
  role: ChatRole | 'tool'
  content: string
  images?: string[]
  tool_calls?: ToolCall[]
  tool_name?: string
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}

interface TagsResponse {
  models: { name: string }[]
}

interface ShowResponse {
  capabilities?: string[]
}

interface ChatResponse {
  message: OllamaMessage
  done: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>
}

// Fetches from Ollama, turning failures into messages the player can act on.
async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new UnreachableError(t('errors.ollama.timeout'), { cause: error })
    }
    throw new UnreachableError(t('errors.ollama.unreachable', { url: OLLAMA_URL }), {
      cause: error
    })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? body
    } catch {
      // body was not JSON; use it as-is
    }
    throw new Error(
      t('errors.ollama.error', { detail: `${res.status}: ${detail || res.statusText}` })
    )
  }
  return res
}

async function supportsVision(model: string): Promise<boolean> {
  try {
    const info = await request<ShowResponse>('/api/show', {
      method: 'POST',
      body: JSON.stringify({ model })
    })
    return info.capabilities?.includes('vision') ?? false
  } catch {
    return false
  }
}

export async function listModels(): Promise<ModelInfo[]> {
  const data = await request<TagsResponse>('/api/tags')
  return Promise.all(
    data.models.map(async (m) => ({ name: m.name, vision: await supportsVision(m.name) }))
  )
}

// One round-trip to /api/chat. The caller handles any tool calls in the reply.
export async function chatOnce(
  model: string,
  messages: OllamaMessage[],
  options: {
    tools?: ToolDefinition[]
    // JSON schema the reply must follow.
    format?: object
    // false skips a reasoning model's thinking step, for fast background calls.
    think?: boolean
    // Receives the answer's text as Ollama writes it.
    onText?: (delta: string) => void
  } = {}
): Promise<OllamaMessage> {
  usedModels.add(model)
  const { onText, ...rest } = options
  if (!onText) {
    const data = await request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model, messages, stream: false, ...rest })
    })
    return data.message
  }
  const res = await send('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ model, messages, stream: true, ...rest })
  })
  if (!res.body) throw new Error(t('errors.ollama.noAnswer'))
  // Ollama streams one JSON object per line.
  const message: OllamaMessage = { role: 'assistant', content: '' }
  await forEachLine(res.body, (line) => {
    const chunk = JSON.parse(line) as { message?: OllamaMessage; error?: string }
    if (chunk.error) throw new Error(t('errors.ollama.error', { detail: chunk.error }))
    const part = chunk.message
    if (!part) return
    if (part.content) {
      message.content += part.content
      onText(part.content)
    }
    if (part.tool_calls?.length)
      message.tool_calls = [...(message.tool_calls ?? []), ...part.tool_calls]
  })
  return message
}

// Asks Ollama to unload the models GameMate used, so they stop holding memory and GPU once
// GameMate quits (Ollama would otherwise keep them loaded for a few minutes). Models that
// only other apps loaded are left alone.
// Loads a model into memory ahead of a question, so the answer doesn't wait for it.
export async function preloadModel(model: string): Promise<void> {
  usedModels.add(model)
  await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
}

export async function unloadModels(timeoutMs = 3000): Promise<void> {
  const models = [...usedModels]
  usedModels.clear()
  await Promise.allSettled(
    models.map((model) =>
      fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, keep_alive: 0 }),
        signal: AbortSignal.timeout(timeoutMs)
      })
    )
  )
}
