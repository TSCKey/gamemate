// Picks the AI engine for a job from the player's settings.
import type { LlmEngine } from './llm'
import { getGeminiKey } from './secrets'
import { getSettings } from './settings'

export type Job = 'answers' | 'commentary'

// Throws a message the player can act on when the chosen engine isn't set up yet.
export function engineFor(job: Job): LlmEngine {
  const settings = getSettings()
  const provider = job === 'answers' ? settings.answersEngine : settings.commentaryEngine
  if (provider === 'gemini') {
    const apiKey = getGeminiKey()
    if (!apiKey) throw new Error('Add your Gemini API key in GameMate’s AI settings first.')
    if (!settings.geminiModel) throw new Error('Pick a Gemini model in GameMate’s AI settings.')
    return { provider, model: settings.geminiModel, apiKey }
  }
  if (!settings.model) throw new Error('Pick a model in GameMate first.')
  return { provider: 'local', model: settings.model }
}

export function engineReady(job: Job): boolean {
  try {
    engineFor(job)
    return true
  } catch {
    return false
  }
}
