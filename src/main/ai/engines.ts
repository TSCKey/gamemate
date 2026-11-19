// Picks the AI engine for a job from the player's settings, and in Auto mode decides
// per question whether the local model or Gemini should answer.
import { latestRecipeVersion } from '../games/current'
import { findMentionedItems } from '../games/minecraft'
import { chatCompletion, writeLine } from './llamaClient'
import { withCommentaryEngine, withEngine } from './llamaEngine'
import {
  COMMENTARY_MAX_TOKENS,
  COMMENTARY_RETRY_SAMPLING,
  COMMENTARY_SAMPLING,
  commentaryMessages
} from '../companion/commentaryFormat'
import type { LlmEngine } from './llm'
import { COMMENTARY_MODEL_ID, isLocalModelInstalled } from './localModels'
import { preloadModel } from './ollamaClient'
import { decide } from './router'
import { getGeminiKey } from '../system/secrets'
import { getSettings, type Settings } from '../system/settings'
import { t } from '../system/i18n'
import { UnreachableError } from './errors'

export type Job = 'answers' | 'commentary'

// "On this PC": GameMate's built-in engine, or the player's own Ollama install.
function localEngine(): LlmEngine {
  const settings = getSettings()
  if (settings.localBackend === 'builtin') {
    if (!isLocalModelInstalled(settings.builtinModel)) {
      throw new Error(t('errors.ai.noLocalModel'))
    }
    return { provider: 'builtin', model: settings.builtinModel }
  }
  if (!settings.model) throw new Error(t('errors.ai.pickModel'))
  return { provider: 'ollama', model: settings.model }
}

function geminiEngine(): LlmEngine {
  const settings = getSettings()
  if (!settings.geminiConsent) {
    throw new Error(t('errors.gemini.turnOn'))
  }
  const apiKey = getGeminiKey()
  if (!apiKey) throw new Error(t('errors.gemini.addKey'))
  if (!settings.geminiModel) throw new Error(t('errors.gemini.pickModel'))
  return { provider: 'gemini', model: settings.geminiModel, apiKey }
}

function available(make: () => LlmEngine): LlmEngine | null {
  try {
    return make()
  } catch {
    return null
  }
}

// Starts loading the local model when the player opens GameMate, so it is ready by the time
// they have typed or said their question. Gemini needs no warming up.
export function warmUp(): void {
  if (getSettings().answersEngine === 'gemini') return
  const engine = available(localEngine)
  if (!engine) return
  const loading =
    engine.provider === 'builtin'
      ? withEngine(engine.model, async () => {})
      : preloadModel(engine.model)
  loading.catch(() => undefined)
}

// Runs a model once right after it is downloaded: the graphics driver prepares its programs on
// the first run (which can take half a minute) and keeps them for later, so the player's first
// real question isn't slow.
export function primeModel(modelId: string): void {
  const filler = 'GameMate is a gaming companion. '.repeat(40)
  withEngine(modelId, (server) =>
    chatCompletion(
      server,
      [
        {
          role: 'user',
          content: `${filler}
Reply with just OK.`
        }
      ],
      { fast: true }
    )
  ).catch(() => undefined)
}

// Throws a message the player can act on when the chosen engine isn't set up yet.
// (Auto mode for questions is handled by routeQuestion.)
export function engineFor(job: Job): LlmEngine {
  const settings = getSettings()
  const provider = job === 'answers' ? settings.answersEngine : settings.commentaryEngine
  return provider === 'gemini' ? geminiEngine() : localEngine()
}

export function engineReady(job: Job): boolean {
  return available(() => engineFor(job)) !== null
}

// The fine-tuned comment writer writes the comments when the player turned it on, it is
// downloaded, comments are written on this PC, and they are in English (the only language it was
// trained in). Everything else, and any comment it can't write, stays with the main model.
export function commentaryWriterFor(
  settings: Pick<Settings, 'commentaryModel' | 'commentaryEngine' | 'language'>,
  installed: (id: string) => boolean = isLocalModelInstalled
): string | null {
  if (!settings.commentaryModel || settings.commentaryEngine !== 'local') return null
  if ((settings.language || 'en') !== 'en') return null
  return installed(COMMENTARY_MODEL_ID) ? COMMENTARY_MODEL_ID : null
}

// One comment from the comment writer, called the way it was trained (commentaryFormat.ts).
export function writeComment(modelId: string, prompt: string): Promise<string> {
  const { system, user, retry } = commentaryMessages(prompt)
  return withCommentaryEngine(modelId, (server) =>
    writeLine(
      server,
      [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      retry ? COMMENTARY_RETRY_SAMPLING : COMMENTARY_SAMPLING,
      COMMENTARY_MAX_TOKENS
    )
  )
}

// Starts the comment writer once right after it is downloaded, for the same reason as
// primeModel: the first start prepares the graphics driver's programs.
export function primeCommentaryModel(modelId: string): void {
  withCommentaryEngine(modelId, async () => {}).catch(() => undefined)
}

export interface Route {
  engine: LlmEngine
  // Another engine to try if this one can't be reached (Auto mode only).
  fallback: LlmEngine | null
  // Short, player-facing reason for the choice (Auto mode only).
  reason?: string
}

// Auto mode: decide per question, keeping the other engine as a fallback.
function autoRoute(question: string, hasImages: boolean, messages: number): Route {
  const local = available(localEngine)
  const gemini = available(geminiEngine)
  if (!gemini)
    return { engine: localEngine(), fallback: null, reason: t('answers.reason.geminiNotSetUp') }
  if (!local) return { engine: gemini, fallback: null, reason: t('answers.reason.noLocalModel') }
  const decision = decide({
    question,
    hasImages,
    messages,
    mentionsItem: findMentionedItems(latestRecipeVersion(), question).length > 0
  })
  const reason = t(`answers.reason.${decision.reason}`)
  return decision.cloud
    ? { engine: gemini, fallback: local, reason }
    : { engine: local, fallback: gemini, reason }
}

export function routeQuestion(question: string, hasImages: boolean, messages: number): Route {
  if (getSettings().answersEngine === 'auto') return autoRoute(question, hasImages, messages)
  return { engine: engineFor('answers'), fallback: null }
}

// Errors where trying the other engine makes sense (offline, limits, timeouts),
// as opposed to e.g. a rejected key the player has to fix.
export function isUnreachable(error: unknown): boolean {
  if (error instanceof UnreachableError) return true
  // Network failures that reach here without a GameMate message.
  const message = error instanceof Error ? error.message : String(error)
  return /ECONNREFUSED|fetch failed/i.test(message)
}
