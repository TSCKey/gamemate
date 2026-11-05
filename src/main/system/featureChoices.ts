// Applying what the player ticked on the "Get the full GameMate experience" screen. Nothing is
// turned on or downloaded unless it was ticked and the player pressed Continue.
import type { FeatureChoices, Settings } from '../../shared/types'
import { languageInfo } from '../../shared/languages'
import { downloadSpeechModel, isSpeechModelInstalled } from '../voice/voiceModels'
import { scanGames } from '../ipc/games'
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

// Only ticked rows turn features on; an unticked row leaves what the player set in Settings
// alone. The tray box is the exception: closing to the tray follows it either way.
export function applyFeatureChoices(input: unknown): Settings {
  const choices = parseFeatureChoices(input)
  const language = getSettings().language || 'en'
  const naturalWanted = choices.naturalVoice && languageInfo(language).naturalVoice

  const patch: Record<string, unknown> = { closeToTray: choices.tray, featureChoices: 'answered' }
  if (choices.games) patch.deviceConsent = true
  if (choices.lookups) patch.webLookup = true
  if (choices.voice) {
    patch.voiceInput = true
    patch.speechModel = 'accurate'
  }
  if (choices.screenshot) patch.chatScreenshot = true
  // Chosen at once, so the Voice panel shows the download; Windows voices speak until it's done.
  if (naturalWanted) patch.voiceEngine = 'natural'
  const result = updateSettings(patch)

  if (choices.games) {
    scanGames().catch((error) => console.error('Finding games failed', error))
  }
  if (choices.voice && !isSpeechModelInstalled('accurate')) download('accurate')
  if (naturalWanted && !isSpeechModelInstalled('supertonic')) download('supertonic')
  return result
}

function download(id: 'accurate' | 'supertonic'): void {
  downloadSpeechModel(id).catch((error) =>
    console.error(`Downloading the ${id} speech model failed`, error)
  )
}
