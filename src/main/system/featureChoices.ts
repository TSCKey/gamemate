// Applying what the player ticked on the "Get the full GameMate experience" screen. Nothing is
// turned on or downloaded unless it was ticked and the player pressed Continue.
import type { FeatureChoices, Settings } from '../../shared/types'
import { languageInfo } from '../../shared/languages'
import { downloadSpeechModel, isSpeechModelInstalled } from '../voice/voiceModels'
import { getSettings, updateSettings } from './settings'

const KEYS = ['games', 'lookups', 'voice', 'naturalVoice', 'screenshot', 'tray'] as const

// Missing keys count as false, a present non-boolean is refused, unknown keys are ignored.
export function parseFeatureChoices(input: unknown): FeatureChoices {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Invalid settings.')
  }
  const source = input as Record<string, unknown>
  const choices = {} as FeatureChoices
  for (const key of KEYS) {
    const value = source[key]
    if (value !== undefined && typeof value !== 'boolean') throw new Error('Invalid settings.')
    choices[key] = value === true
  }
  return choices
}

export function applyFeatureChoices(input: unknown): Settings {
  const choices = parseFeatureChoices(input)
  const language = getSettings().language || 'en'
  const naturalWanted =
    choices.naturalVoice && languageInfo(language).naturalVoice
  const naturalInstalled = naturalWanted && isSpeechModelInstalled('supertonic')

  const patch: Record<string, unknown> = {
    deviceConsent: choices.games,
    webLookup: choices.lookups,
    voiceInput: choices.voice,
    chatScreenshot: choices.screenshot,
    closeToTray: choices.tray,
    featureChoices: 'answered'
  }
  if (choices.voice) patch.speechModel = 'accurate'
  if (naturalInstalled) patch.voiceEngine = 'natural'
  const result = updateSettings(patch)

  if (choices.voice && !isSpeechModelInstalled('accurate')) void downloadSpeechModel('accurate')
  if (naturalWanted && !naturalInstalled) {
    void downloadSpeechModel('supertonic').then(() => {
      if (isSpeechModelInstalled('supertonic')) updateSettings({ voiceEngine: 'natural' })
    })
  }
  return result
}
