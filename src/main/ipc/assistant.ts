// Questions to GameMate's AI.
import { ask, type AssistantReply } from '../ai/assistant'
import { isUnreachable, routeQuestion } from '../ai/engines'
import { gameContext } from '../games/current'
import type { LlmEngine } from '../ai/llm'
import { listModels, type ChatMessage } from '../ai/ollamaClient'
import { recentObservations } from '../companion/observer'
import { handle } from '../system/security'
import { getGeminiKey } from '../system/secrets'
import { getSettings } from '../system/settings'
import { t } from '../system/i18n'

const VALID_ROLES = new Set(['user', 'assistant'])
const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

function isImageList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 4 &&
    value.every(
      (img) =>
        typeof img === 'string' && img.length <= MAX_IMAGE_BASE64_LENGTH && BASE64_PATTERN.test(img)
    )
  )
}

// Renderer input is untrusted: check its shape and keep only known fields.
function parseChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) throw new Error('Invalid chat messages.')
  return value.map((m) => {
    if (
      typeof m !== 'object' ||
      m === null ||
      !VALID_ROLES.has(m.role) ||
      typeof m.content !== 'string' ||
      (m.images !== undefined && !isImageList(m.images))
    ) {
      throw new Error('Invalid chat messages.')
    }
    return { role: m.role, content: m.content, ...(m.images ? { images: m.images } : {}) }
  })
}

export function registerAssistantHandlers(): void {
  handle('ollama:list-models', () => listModels())

  handle('assistant:ask', async (event, messages: unknown, requestId: unknown) => {
    const history = parseChatMessages(messages)
    // The answer is shown while it is written, when the window asked for that.
    const onText =
      typeof requestId === 'number'
        ? (text: string): void => {
            if (!event.sender.isDestroyed()) event.sender.send('assistant:text', requestId, text)
          }
        : undefined
    const { webLookup, detailedAnswers, webSearch, geminiConsent, geminiModel, language } =
      getSettings()
    // Web search goes through Gemini: only with the player's consents, key and model.
    const apiKey = webSearch && geminiConsent && geminiModel ? getGeminiKey() : null
    const search = apiKey ? { apiKey, model: geminiModel } : undefined
    const game = await gameContext(history.at(-1)?.content)
    const last = history.at(-1)
    const route = routeQuestion(last?.content ?? '', Boolean(last?.images?.length), history.length)
    const askWith = async (engine: LlmEngine, reason?: string): Promise<AssistantReply> => {
      // Logs how it went, never what was asked.
      const what = `${engine.provider} ${engine.model}`
      const started = Date.now()
      const reply = await ask(
        {
          engine,
          game,
          webLookup,
          language: language || 'en',
          detailed: detailedAnswers,
          search,
          observations: recentObservations(),
          onText
        },
        history
      ).catch((error: unknown) => {
        console.warn(`Answer by ${what} failed:`, error instanceof Error ? error.message : error)
        throw error
      })
      console.info(`Answered by ${what} in ${((Date.now() - started) / 1000).toFixed(1)} s`)
      return reply.answeredBy ? { ...reply, answeredBy: { ...reply.answeredBy, reason } } : reply
    }
    try {
      return await askWith(route.engine, route.reason)
    } catch (error) {
      // Auto mode: if the chosen AI is offline or out of quota, the other one answers.
      if (!route.fallback || !isUnreachable(error)) throw error
      onText?.('')
      return askWith(
        route.fallback,
        route.engine.provider === 'gemini'
          ? t('answers.reason.geminiUnreachable')
          : t('answers.reason.localUnreachable')
      )
    }
  })
}
