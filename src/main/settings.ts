// User settings shared by the main window and the floating window, saved to userData.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isSpeechModelId, type SpeechModelId } from './voiceModels'

// How much GameMate watches and talks on its own (see README "Always-on companion").
export const COMPANION_MODES = [
  'disabled',
  'on-demand',
  'observation',
  'commentary',
  'quiet'
] as const
export type CompanionMode = (typeof COMPANION_MODES)[number]
export const COMMENTARY_FREQUENCIES = ['rare', 'normal', 'frequent'] as const
export type CommentaryFrequency = (typeof COMMENTARY_FREQUENCIES)[number]

export const SPEAK_ANSWERS = ['off', 'voice', 'always'] as const
export type SpeakAnswers = (typeof SPEAK_ANSWERS)[number]

export const ENGINES = ['local', 'gemini'] as const
export type Engine = (typeof ENGINES)[number]

export interface Settings {
  // Ollama model used for answers ('' until the user or GameMate picks one).
  model: string
  minecraftVersion: string
  // Whether the floating window sends a screenshot of the screen with each question.
  overlayScreenshot: boolean
  companionMode: CompanionMode
  commentaryFrequency: CommentaryFrequency
  // Talk to GameMate with the microphone (needs a downloaded speech model).
  voiceInput: boolean
  speechModel: SpeechModelId
  // Read answers aloud: never, only for questions asked by voice, or always.
  speakAnswers: SpeakAnswers
  // Read the companion's comments aloud.
  speakComments: boolean
  // Windows voice name ('' = the system default voice).
  voiceName: string
  voiceVolume: number
  voiceRate: number
  // Which AI answers questions, and which watches the game: the local model or Gemini (opt-in).
  answersEngine: Engine
  commentaryEngine: Engine
  // Gemini model id, e.g. from the list GameMate fetches with the player's key.
  geminiModel: string
  // Let the AI look things up on minecraft.wiki.
  webLookup: boolean
}

const DEFAULTS: Settings = {
  model: '',
  minecraftVersion: '26.1',
  overlayScreenshot: true,
  // Watching the screen is opt-in.
  companionMode: 'on-demand',
  commentaryFrequency: 'normal',
  voiceInput: false,
  speechModel: 'accurate',
  speakAnswers: 'voice',
  speakComments: false,
  voiceName: '',
  voiceVolume: 1,
  voiceRate: 1,
  // Everything stays local until the player chooses otherwise.
  answersEngine: 'local',
  commentaryEngine: 'local',
  geminiModel: '',
  webLookup: false
}

const listeners: ((settings: Settings) => void)[] = []

// Lets main-process modules (e.g. the observer) react to setting changes.
export function onSettingsChanged(listener: (settings: Settings) => void): void {
  listeners.push(listener)
}

const file = (): string => join(app.getPath('userData'), 'settings.json')
let current: Settings | null = null

export function getSettings(): Settings {
  if (!current) {
    try {
      current = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>) }
    } catch {
      current = { ...DEFAULTS }
    }
  }
  return current
}

// Renderer input is untrusted: only accept known keys with the right types.
export function updateSettings(patch: unknown, validVersions: string[]): Settings {
  if (typeof patch !== 'object' || patch === null) throw new Error('Invalid settings.')
  const p = patch as Record<string, unknown>
  const next = { ...getSettings() }
  if (typeof p.model === 'string') next.model = p.model.slice(0, 200)
  if (typeof p.minecraftVersion === 'string' && validVersions.includes(p.minecraftVersion)) {
    next.minecraftVersion = p.minecraftVersion
  }
  if (typeof p.overlayScreenshot === 'boolean') next.overlayScreenshot = p.overlayScreenshot
  if (COMPANION_MODES.includes(p.companionMode as CompanionMode)) {
    next.companionMode = p.companionMode as CompanionMode
  }
  if (COMMENTARY_FREQUENCIES.includes(p.commentaryFrequency as CommentaryFrequency)) {
    next.commentaryFrequency = p.commentaryFrequency as CommentaryFrequency
  }
  if (typeof p.voiceInput === 'boolean') next.voiceInput = p.voiceInput
  if (isSpeechModelId(p.speechModel)) next.speechModel = p.speechModel
  if (SPEAK_ANSWERS.includes(p.speakAnswers as SpeakAnswers)) {
    next.speakAnswers = p.speakAnswers as SpeakAnswers
  }
  if (typeof p.speakComments === 'boolean') next.speakComments = p.speakComments
  if (typeof p.voiceName === 'string') next.voiceName = p.voiceName.slice(0, 200)
  const num = (v: unknown, min: number, max: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null
  next.voiceVolume = num(p.voiceVolume, 0, 1) ?? next.voiceVolume
  next.voiceRate = num(p.voiceRate, 0.5, 2) ?? next.voiceRate
  if (ENGINES.includes(p.answersEngine as Engine)) next.answersEngine = p.answersEngine as Engine
  if (ENGINES.includes(p.commentaryEngine as Engine)) {
    next.commentaryEngine = p.commentaryEngine as Engine
  }
  if (typeof p.geminiModel === 'string' && /^[\w.-]{0,100}$/.test(p.geminiModel)) {
    next.geminiModel = p.geminiModel
  }
  if (typeof p.webLookup === 'boolean') next.webLookup = p.webLookup

  current = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (error) {
    console.error('Could not save settings', error)
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', next)
  for (const listener of listeners) listener(next)
  return next
}
