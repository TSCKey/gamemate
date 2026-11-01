// Minimal client for the local Ollama HTTP API.
// See https://github.com/ollama/ollama/blob/main/docs/api.md

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

export interface ModelInfo {
  name: string
  vision: boolean
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
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Ollama took too long to respond.', { cause: error })
    }
    throw new Error(`Could not reach Ollama at ${OLLAMA_URL}. Is it running?`, { cause: error })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? body
    } catch {
      // body was not JSON; use it as-is
    }
    throw new Error(`Ollama error ${res.status}: ${detail || res.statusText}`)
  }

  return (await res.json()) as T
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
  } = {}
): Promise<OllamaMessage> {
  usedModels.add(model)
  const data = await request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ model, messages, stream: false, ...options })
  })
  return data.message
}

// Asks Ollama to unload the models GameMate used, so they stop holding memory and GPU once
// GameMate quits (Ollama would otherwise keep them loaded for a few minutes). Models that
// only other apps loaded are left alone.
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
