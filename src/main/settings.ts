// User settings shared by the main window and the floating window, saved to userData.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isSpeechModelId, type SpeechModelId } from './voiceModels'
import { isLocalModelId, LOCAL_MODELS } from './localModels'
import type { SavedGame } from './games/catalog'
import { existsSync } from 'fs'

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
// Where "on this PC" models run: GameMate's built-in engine, or the player's Ollama install.
export const LOCAL_BACKENDS = ['builtin', 'ollama'] as const
export type LocalBackend = (typeof LOCAL_BACKENDS)[number]

// Questions can also be routed automatically, per question.
export const ANSWER_ENGINES = [...ENGINES, 'auto'] as const
export type AnswerEngine = (typeof ANSWER_ENGINES)[number]

export interface Settings {
  localBackend: LocalBackend
  // Built-in model from the catalog in localModels.ts.
  builtinModel: string
  // Ollama model used when localBackend is 'ollama' ('' until the user or GameMate picks one).
  model: string
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
  // Which AI answers questions (or 'auto' to decide per question), and which watches the game:
  // the local model or Gemini (opt-in).
  answersEngine: AnswerEngine
  commentaryEngine: Engine
  // Gemini model id, e.g. from the list GameMate fetches with the player's key.
  geminiModel: string
  // Let the AI look things up on minecraft.wiki.
  webLookup: boolean
  // Version of the privacy notice the player has read (0 = not shown yet).
  privacyNoticeVersion: number
  // The player agreed to send data to Google to use Gemini (required before a key is saved).
  geminiConsent: boolean
  // Closing the window keeps GameMate in the tray (for the shortcuts and companion) instead
  // of quitting.
  closeToTray: boolean
  // Check GitHub for new versions now and then (the installed app only).
  autoUpdate: boolean
  // The player allowed GameMate to look at this PC for games: launcher libraries, modpack
  // folders and the program in front. Nothing is detected without it.
  deviceConsent: boolean
  // The game GameMate helps with ('minecraft' or a found or added game's id).
  currentGame: string
  // Switch to the game in front automatically when the player is in one.
  autoDetectGame: boolean
  // Games found by a scan or added by the player (only changed through setGames).
  games: SavedGame[]
  // Minecraft modpack: 'auto' (the one running), '' (none) or a pack's folder.
  minecraftModpack: string
}

// Bump when the privacy notice changes in a way players should see again.
export const PRIVACY_NOTICE_VERSION = 1

const DEFAULTS: Settings = {
  // New players get the built-in engine: no other install needed.
  localBackend: 'builtin',
  builtinModel: LOCAL_MODELS[0].id,
  model: '',
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
  webLookup: false,
  privacyNoticeVersion: 0,
  geminiConsent: false,
  closeToTray: true,
  autoUpdate: true,
  deviceConsent: false,
  currentGame: 'minecraft',
  autoDetectGame: true,
  games: [],
  minecraftModpack: 'auto'
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
      const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>
      current = { ...DEFAULTS, ...saved }
      // Players who set GameMate up with Ollama before the built-in engine existed keep it.
      if (saved.localBackend === undefined && saved.model) current.localBackend = 'ollama'
    } catch {
      current = { ...DEFAULTS }
    }
  }
  return current
}

// Renderer input is untrusted: only accept known keys with the right types.
export function updateSettings(patch: unknown): Settings {
  if (typeof patch !== 'object' || patch === null) throw new Error('Invalid settings.')
  const p = patch as Record<string, unknown>
  const next = { ...getSettings() }
  if (LOCAL_BACKENDS.includes(p.localBackend as LocalBackend)) {
    next.localBackend = p.localBackend as LocalBackend
  }
  if (isLocalModelId(p.builtinModel)) next.builtinModel = p.builtinModel
  if (typeof p.model === 'string') next.model = p.model.slice(0, 200)
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
  if (ANSWER_ENGINES.includes(p.answersEngine as AnswerEngine)) {
    next.answersEngine = p.answersEngine as AnswerEngine
  }
  if (ENGINES.includes(p.commentaryEngine as Engine)) {
    next.commentaryEngine = p.commentaryEngine as Engine
  }
  if (typeof p.geminiModel === 'string' && /^[\w.-]{0,100}$/.test(p.geminiModel)) {
    next.geminiModel = p.geminiModel
  }
  if (typeof p.webLookup === 'boolean') next.webLookup = p.webLookup
  if (p.privacyNoticeVersion === PRIVACY_NOTICE_VERSION) {
    next.privacyNoticeVersion = PRIVACY_NOTICE_VERSION
  }
  if (typeof p.geminiConsent === 'boolean') next.geminiConsent = p.geminiConsent
  if (typeof p.closeToTray === 'boolean') next.closeToTray = p.closeToTray
  if (typeof p.deviceConsent === 'boolean') next.deviceConsent = p.deviceConsent
  if (typeof p.autoUpdate === 'boolean') next.autoUpdate = p.autoUpdate
  if (
    typeof p.currentGame === 'string' &&
    (p.currentGame === 'minecraft' || next.games.some((g) => g.id === p.currentGame))
  ) {
    next.currentGame = p.currentGame
  }
  if (typeof p.autoDetectGame === 'boolean') next.autoDetectGame = p.autoDetectGame
  if (
    typeof p.minecraftModpack === 'string' &&
    (p.minecraftModpack === 'auto' ||
      p.minecraftModpack === '' ||
      (p.minecraftModpack.length < 400 && existsSync(p.minecraftModpack)))
  ) {
    next.minecraftModpack = p.minecraftModpack
  }
  // Taking back consent forgets everything GameMate found on this PC.
  if (!next.deviceConsent) {
    next.games = []
    next.currentGame = 'minecraft'
    next.minecraftModpack = 'auto'
  }
  // Nothing goes to Google without the player's consent.
  if (!next.geminiConsent) {
    next.answersEngine = 'local'
    next.commentaryEngine = 'local'
  }

  save(next)
  return next
}

// Found and added games come from the main process (which checks them), never straight from a page.
export function setGames(games: SavedGame[]): Settings {
  const next = { ...getSettings(), games }
  if (next.currentGame !== 'minecraft' && !games.some((g) => g.id === next.currentGame)) {
    next.currentGame = 'minecraft'
  }
  save(next)
  return next
}

// Back to the defaults (used by "Delete my data").
export function resetSettings(): Settings {
  save({ ...DEFAULTS })
  return { ...DEFAULTS }
}

function save(next: Settings): void {
  current = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (error) {
    console.error('Could not save settings', error)
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', next)
  for (const listener of listeners) listener(next)
}
