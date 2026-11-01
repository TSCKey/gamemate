// Picks the AI engine for a job from the player's settings, and in Auto mode decides
// per question whether the local model or Gemini should answer.
import { findMentionedItems } from './games/minecraft'
import type { LlmEngine } from './llm'
import { isLocalModelInstalled } from './localModels'
import { decide } from './router'
import { getGeminiKey } from './secrets'
import { getSettings } from './settings'

export type Job = 'answers' | 'commentary'

// "On this PC": GameMate's built-in engine, or the player's own Ollama install.
function localEngine(): LlmEngine {
  const settings = getSettings()
  if (settings.localBackend === 'builtin') {
    if (!isLocalModelInstalled(settings.builtinModel)) {
      throw new Error('Download an AI model in GameMate first (Settings → Models).')
    }
    return { provider: 'builtin', model: settings.builtinModel }
  }
  if (!settings.model) throw new Error('Pick a model in GameMate first.')
  return { provider: 'ollama', model: settings.model }
}

function geminiEngine(): LlmEngine {
  const settings = getSettings()
  if (!settings.geminiConsent) {
    throw new Error('Turn on Gemini in GameMate’s settings (AI & online) first.')
  }
  const apiKey = getGeminiKey()
  if (!apiKey) throw new Error('Add your Gemini API key in GameMate’s AI settings first.')
  if (!settings.geminiModel) throw new Error('Pick a Gemini model in GameMate’s AI settings.')
  return { provider: 'gemini', model: settings.geminiModel, apiKey }
}

function available(make: () => LlmEngine): LlmEngine | null {
  try {
    return make()
  } catch {
    return null
  }
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
  if (!gemini) return { engine: localEngine(), fallback: null, reason: 'Gemini isn’t set up' }
  if (!local) return { engine: gemini, fallback: null, reason: 'no local model' }
  const { cloud, reason } = decide({
    question,
    hasImages,
    messages,
    mentionsItem: findMentionedItems(getSettings().minecraftVersion, question).length > 0
  })
  return cloud
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
  const message = error instanceof Error ? error.message : String(error)
  return /could not reach|usage limit|took too long|not running|ECONNREFUSED|fetch failed|couldn.t start|stopped unexpectedly/i.test(
    message
  )
}
