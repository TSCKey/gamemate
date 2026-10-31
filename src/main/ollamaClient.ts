// Minimal client for the local Ollama HTTP API.
// See https://github.com/ollama/ollama/blob/main/docs/api.md

const OLLAMA_URL = 'http://127.0.0.1:11434'
const REQUEST_TIMEOUT_MS = 120_000

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

interface TagsResponse {
  models: { name: string }[]
}

interface ChatResponse {
  message: ChatMessage
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

export async function listModels(): Promise<string[]> {
  const data = await request<TagsResponse>('/api/tags')
  return data.models.map((m) => m.name)
}

export async function chat(model: string, messages: ChatMessage[]): Promise<ChatMessage> {
  const data = await request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ model, messages, stream: false })
  })
  // Drop extra fields (e.g. `thinking` from reasoning models) so only the answer is kept in history.
  return { role: data.message.role, content: data.message.content }
}
