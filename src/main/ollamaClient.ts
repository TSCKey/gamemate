// Minimal client for the local Ollama HTTP API.
// See https://github.com/ollama/ollama/blob/main/docs/api.md

const OLLAMA_URL = 'http://127.0.0.1:11434'
const REQUEST_TIMEOUT_MS = 120_000

const SYSTEM_PROMPT = `You are GameMate, a friendly AI companion that helps people while they play video games.
Answer clearly and briefly (a few sentences), like a knowledgeable friend sitting next to the player.
Write plain text: no Markdown, headings or bold.
When the user attaches a screenshot, it shows their screen right now: base your answer on what is actually visible in it, and say so if something is unclear or not visible.
Never invent game facts you are unsure about.`

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  // Base64-encoded images (no data: prefix) for vision models.
  images?: string[]
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

export async function chat(model: string, messages: ChatMessage[]): Promise<ChatMessage> {
  // Only the latest message keeps its screenshot: older ones would slow every reply
  // and describe a screen that has since changed.
  const lastIndex = messages.length - 1
  const prepared = messages.map((m, i) =>
    i === lastIndex ? m : { role: m.role, content: m.content }
  )

  const data = await request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...prepared],
      stream: false
    })
  })
  // Drop extra fields (e.g. `thinking` from reasoning models) so only the answer is kept in history.
  return { role: data.message.role, content: data.message.content }
}
