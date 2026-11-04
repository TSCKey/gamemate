import { t } from '../system/i18n'
import { UnreachableError } from './errors'
import { requestSignal, throwIfStopped } from './stop'
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
  tools?: ({ functionDeclarations: GeminiFunction[] } | { googleSearch: Record<string, never> })[]
  generationConfig?: {
    responseMimeType?: string
    responseSchema?: object
    // Gemini 3 and later think at "high" unless told otherwise.
    thinkingConfig?: { thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' }
  }
}

interface GeminiResponse {
  candidates?: {
    content?: GeminiContent
    finishReason?: string
    // Present when Google Search was used.
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[]
      searchEntryPoint?: { renderedContent?: string }
    }
  }[]
  promptFeedback?: { blockReason?: string }
}

// How long to wait before asking again after Google reports high demand, and how long Gemini
// may stay silent while it writes an answer. Changeable for tests.
const timings = { retryMs: 1500, idleMs: 45_000 }
export function setTimings(next: Partial<typeof timings>): void {
  Object.assign(timings, next)
}

// A request Gemini refused, with its status and Google's explanation (the message is GameMate's).
export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string
  ) {
    super(message)
  }
}

// "Too many requests", with how long to wait from Google's own details: a daily limit lasts until
// midnight Pacific time, a per-minute one only as long as Google asks (or a minute).
export class QuotaError extends UnreachableError {
  constructor(readonly until: number) {
    super(t('errors.gemini.usageLimit'))
  }
}

interface GoogleErrorDetail {
  '@type'?: string
  retryDelay?: string
  violations?: { quotaId?: string }[]
}

function quotaWait(details: GoogleErrorDetail[], now = new Date()): number {
  const daily = details.some((d) =>
    (d.violations ?? []).some((v) => /per ?day/i.test(v.quotaId ?? ''))
  )
  if (daily) return nextQuotaReset(now).getTime()
  const delay = details.find((d) => d.retryDelay)?.retryDelay
  const seconds = delay ? Number.parseFloat(delay) : NaN
  return now.getTime() + (Number.isFinite(seconds) ? seconds * 1000 : 60_000)
}

// Google's "busy" answers: they usually pass within seconds.
const BUSY = new Set([500, 502, 503, 504])

const wait = (ms: number, stop?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    stop?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(stop.reason)
    })
  })

// Sends one request, asking once more when Google is busy, and turns failures into messages the
// player can act on. `signal` limits how long it may take; `stop` is the player's ■.
async function send(
  apiKey: string,
  path: string,
  body: object | undefined,
  signal: AbortSignal,
  stop?: AbortSignal
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: body ? JSON.stringify(body) : undefined,
        signal
      })
    } catch (error) {
      throwIfStopped(stop)
      if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
        throw new UnreachableError(t('errors.gemini.timeout'), { cause: error })
      }
      throw new UnreachableError(t('errors.gemini.unreachable'), { cause: error })
    }
    if (res.ok) return res
    if (BUSY.has(res.status) && attempt === 1) {
      await res.body?.cancel().catch(() => {})
      await wait(timings.retryMs, stop)
      continue
    }
    let detail = ''
    let details: GoogleErrorDetail[] = []
    try {
      const error = (
        (await res.json()) as { error?: { message?: string; details?: GoogleErrorDetail[] } }
      ).error
      detail = error?.message ?? ''
      details = Array.isArray(error?.details) ? error.details : []
    } catch {
      // not JSON
    }
    if (res.status === 400 && /api key/i.test(detail)) {
      throw new Error(t('errors.gemini.badKey'))
    }
    if (res.status === 403) throw new Error(t('errors.gemini.keyNotAllowed'))
    if (res.status === 429) throw new QuotaError(quotaWait(details))
    // Still busy after a second try: in Auto mode the built-in AI answers instead.
    if (BUSY.has(res.status)) throw new UnreachableError(t('errors.gemini.busy'))
    throw new GeminiRequestError(
      t('errors.gemini.error', { status: res.status, detail: detail ? `: ${detail}` : '' }),
      res.status,
      detail
    )
  }
}

async function call<T>(
  apiKey: string,
  path: string,
  body?: object,
  stop?: AbortSignal
): Promise<T> {
  const res = await send(apiKey, path, body, requestSignal(TIMEOUT_MS, stop), stop)
  return (await res.json()) as T
}

// Reads Gemini's answer as it is written (server-sent events), passing each chunk on. It gives up
// only when Gemini stays silent too long, however long the whole answer takes.
async function callStreaming(
  apiKey: string,
  path: string,
  body: object,
  onChunk: (chunk: GeminiResponse) => void,
  stop?: AbortSignal
): Promise<void> {
  const silence = new AbortController()
  let timer = setTimeout(() => silence.abort(), timings.idleMs)
  const heard = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => silence.abort(), timings.idleMs)
  }
  const signal = stop ? AbortSignal.any([silence.signal, stop]) : silence.signal
  try {
    const res = await send(apiKey, path, body, signal, stop)
    if (!res.body) throw new Error(t('errors.gemini.noAnswer', { reason: '' }))
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    // Stop reading at once on silence or ■, whatever the network layer does with the signal.
    signal.addEventListener('abort', () => void reader.cancel().catch(() => {}))
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        heard()
        buffer += value
        // Events are separated by a blank line; each has one "data: {json}" line.
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''
        for (const event of events) {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('')
          if (data) onChunk(JSON.parse(data) as GeminiResponse)
        }
      }
    } catch (error) {
      // The connection dropped (or a chunk was garbled) halfway through the answer: like not
      // reaching Gemini at all, so Auto mode can ask the built-in AI instead.
      throwIfStopped(stop)
      if (silence.signal.aborted) throw error
      void reader.cancel().catch(() => {})
      throw new UnreachableError(t('errors.gemini.unreachable'), { cause: error })
    }
    // A cancelled read ends like a finished one: a cut-off answer is not an answer.
    if (signal.aborted) throw signal.reason
  } catch (error) {
    throwIfStopped(stop)
    if (silence.signal.aborted) {
      throw new UnreachableError(t('errors.gemini.timeout'), { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
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
// can be sent back as-is in the next turn. With `onText`, the answer's text is passed on while
// Gemini writes it.
export async function generate(
  apiKey: string,
  model: string,
  request: GeminiRequest,
  stop?: AbortSignal,
  onText?: (delta: string) => void
): Promise<GeminiContent> {
  if (!/^[\w.-]+$/.test(model)) throw new Error('Invalid Gemini model name.')
  if (!onText) {
    const data = await call<GeminiResponse>(
      apiKey,
      `models/${model}:generateContent`,
      request,
      stop
    )
    return contentOf(data, data.candidates?.[0]?.content?.parts)
  }
  // Every part is kept as it came, thought signatures included (Gemini needs them back).
  const parts: GeminiPart[] = []
  let last: GeminiResponse = {}
  await callStreaming(
    apiKey,
    `models/${model}:streamGenerateContent?alt=sse`,
    request,
    (chunk) => {
      last = chunk
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part)
        if (part.text && !part.thought) onText(part.text)
      }
    },
    stop
  )
  return contentOf(last, parts.length ? parts : undefined)
}

function contentOf(data: GeminiResponse, parts: GeminiPart[] | undefined): GeminiContent {
  if (!parts) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason
    throw new Error(t('errors.gemini.noAnswer', { reason: reason ? ` (${reason})` : '' }))
  }
  return { role: 'model', parts }
}

// Google renews free quotas at midnight Pacific time.
export function nextQuotaReset(now: Date): Date {
  const pacific = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const get = (type: string): string => pacific.find((p) => p.type === type)?.value ?? ''
  // "GMT-08:00" → -8 hours.
  const offset = /GMT([+-]\d{2}):(\d{2})/.exec(get('timeZoneName'))
  const offsetHours = offset ? Number(offset[1]) : -8
  const midnightUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')) + 1
  )
  // Midnight there is (−offset) hours after midnight UTC on the same calendar day.
  return new Date(midnightUtc - offsetHours * 3_600_000)
}

// After Google says "too many requests", searches wait as long as Google asks instead of
// costing a request (and time) on every question.
let searchPausedUntil = 0

export function webSearchPaused(): boolean {
  return Date.now() < searchPausedUntil
}

// For tests.
export function resumeWebSearch(): void {
  searchPausedUntil = 0
}

export interface WebSearchResult {
  // What Google's results say, summarized by Gemini.
  text: string
  // The pages it used (Google's links, which lead to them).
  sources: { title: string; url: string }[]
  // Google's Search Suggestions (HTML), which Google requires apps to show with these results.
  suggestions?: string
}

// Searches the web with Google Search through Gemini. Only the query is sent.
export async function searchWeb(
  apiKey: string,
  model: string,
  query: string
): Promise<WebSearchResult> {
  if (!/^[\w.-]+$/.test(model)) throw new Error('Invalid Gemini model name.')
  if (webSearchPaused()) throw new QuotaError(searchPausedUntil)
  const data = await call<GeminiResponse>(apiKey, `models/${model}:generateContent`, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Search the web for: ${query}\nSummarize the key facts you find in a few sentences of plain text.`
          }
        ]
      }
    ],
    tools: [{ googleSearch: {} }]
  } satisfies GeminiRequest).catch((error: unknown) => {
    if (error instanceof QuotaError) searchPausedUntil = error.until
    throw error
  })
  const candidate = data.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
    .map((web) => ({ title: web.title || new URL(web.uri).host, url: web.uri }))
  return {
    text: text || 'The web search found nothing useful.',
    sources: sources.filter((s, i) => sources.findIndex((o) => o.url === s.url) === i).slice(0, 5),
    suggestions: candidate?.groundingMetadata?.searchEntryPoint?.renderedContent
  }
}
