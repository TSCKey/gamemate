// Minimal client for Google's Gemini API (generateContent), used only when the player opts in.
// The API key is sent in a header, never in the URL.
// See https://ai.google.dev/api/generate-content

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
const TIMEOUT_MS = 60_000

export interface GeminiPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface GeminiFunction {
  name: string
  description: string
  // Standard JSON Schema.
  parametersJsonSchema: object
}

export interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] }
  contents: GeminiContent[]
  tools?: { functionDeclarations: GeminiFunction[] }[]
  generationConfig?: { responseMimeType?: string; responseSchema?: object }
}

interface GeminiResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

async function call<T>(apiKey: string, path: string, body?: object): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Gemini took too long to respond.', { cause: error })
    }
    throw new Error('Could not reach Gemini. Check your internet connection.', { cause: error })
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      // not JSON
    }
    if (res.status === 400 && /api key/i.test(detail)) {
      throw new Error('Gemini rejected the API key. Check it in GameMate’s AI settings.')
    }
    if (res.status === 403) throw new Error('This API key is not allowed to use Gemini.')
    if (res.status === 429) {
      throw new Error(
        'Gemini’s usage limit was reached. Try again later or switch to the local model.'
      )
    }
    throw new Error(`Gemini error ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as T
}

// Gemini models that can answer chats, e.g. "gemini-3.8-flash" (without the "models/" prefix).
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const names: string[] = []
  let pageToken = ''
  do {
    const page = await call<{
      models?: { name: string; supportedGenerationMethods?: string[] }[]
      nextPageToken?: string
    }>(
      apiKey,
      `models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    )
    for (const m of page.models ?? []) {
      const name = m.name.replace(/^models\//, '')
      if (m.supportedGenerationMethods?.includes('generateContent') && name.startsWith('gemini')) {
        names.push(name)
      }
    }
    pageToken = page.nextPageToken ?? ''
  } while (pageToken)
  return names
}

// One round-trip; returns the model's content unchanged so it (with any thought signatures)
// can be sent back as-is in the next turn.
export async function generate(
  apiKey: string,
  model: string,
  request: GeminiRequest
): Promise<GeminiContent> {
  if (!/^[\w.-]+$/.test(model)) throw new Error('Invalid Gemini model name.')
  const data = await call<GeminiResponse>(apiKey, `models/${model}:generateContent`, request)
  const content = data.candidates?.[0]?.content
  if (!content) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason
    throw new Error(`Gemini didn't answer${reason ? ` (${reason})` : ''}.`)
  }
  return { role: 'model', parts: content.parts ?? [] }
}
