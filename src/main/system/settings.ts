// User settings shared by the main window and the floating window, saved to userData.
import { app, BrowserWindow } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isListenModelId, KOKORO_VOICES } from '../voice/voiceModels'
import { isLocalModelId, LOCAL_MODELS } from '../ai/localModels'
import type { SavedGame } from '../games/catalog'
import { existsSync } from 'fs'
import {
  COMPANION_MODES,
  COMMENTARY_FREQUENCIES,
  SPEAK_ANSWERS,
  VOICE_ENGINES,
  ENGINES,
  LOCAL_BACKENDS,
  ANSWER_ENGINES,
  TERMS_VERSION
} from '../../shared/types'
import type {
  CompanionMode,
  CommentaryFrequency,
  SpeakAnswers,
  VoiceEngine,
  Engine,
  LocalBackend,
  AnswerEngine,
  Settings
} from '../../shared/types'
export {
  COMPANION_MODES,
  COMMENTARY_FREQUENCIES,
  SPEAK_ANSWERS,
  VOICE_ENGINES,
  ENGINES,
  LOCAL_BACKENDS,
  ANSWER_ENGINES,
  TERMS_VERSION
}
export type {
  CompanionMode,
  CommentaryFrequency,
  SpeakAnswers,
  VoiceEngine,
  Engine,
  LocalBackend,
  AnswerEngine,
  Settings
}

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
  voiceEngine: 'windows',
  voiceName: '',
  kokoroVoice: 'af_heart',
  voiceVolume: 1,
  voiceRate: 1,
  // Everything stays local until the player chooses otherwise.
  answersEngine: 'local',
  commentaryEngine: 'local',
  geminiModel: '',
  webLookup: false,
  termsVersion: 0,
  termsAcceptedAt: '',
  consents: {},
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
      // From before GameMate recorded consent dates: the consent stands, its date is unknown.
      current.consents = {
        ...(current.geminiConsent ? { gemini: '' } : {}),
        ...(current.deviceConsent ? { games: '' } : {}),
        ...(current.webLookup ? { lookups: '' } : {}),
        ...saved.consents
      }
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
  if (isListenModelId(p.speechModel)) next.speechModel = p.speechModel
  if (SPEAK_ANSWERS.includes(p.speakAnswers as SpeakAnswers)) {
    next.speakAnswers = p.speakAnswers as SpeakAnswers
  }
  if (typeof p.speakComments === 'boolean') next.speakComments = p.speakComments
  if (typeof p.voiceName === 'string') next.voiceName = p.voiceName.slice(0, 200)
  if (VOICE_ENGINES.includes(p.voiceEngine as VoiceEngine))
    next.voiceEngine = p.voiceEngine as VoiceEngine
  if (typeof p.kokoroVoice === 'string' && KOKORO_VOICES.includes(p.kokoroVoice)) {
    next.kokoroVoice = p.kokoroVoice
  }
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
  next.consents = consentDates(next)

  save(next)
  return next
}

// Records when each optional consent is given, and forgets the date when it is withdrawn.
function consentDates(next: Settings): Settings['consents'] {
  const now = new Date().toISOString()
  const date = (on: boolean, was: string | undefined): string | undefined =>
    on ? (was ?? now) : undefined
  const dates = {
    gemini: date(next.geminiConsent, next.consents.gemini),
    games: date(next.deviceConsent, next.consents.games),
    lookups: date(next.webLookup, next.consents.lookups)
  }
  return Object.fromEntries(Object.entries(dates).filter(([, d]) => d !== undefined))
}

// Whether the player has accepted the current Terms of Use. Until then GameMate doesn't go
// online or look at anything on the PC.
export function termsAccepted(settings: Settings = getSettings()): boolean {
  return settings.termsVersion >= TERMS_VERSION
}

export function acceptTerms(): Settings {
  const next = {
    ...getSettings(),
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: new Date().toISOString()
  }
  save(next)
  return next
}

// Withdrawing acceptance closes GameMate to use until the player accepts again. Optional consents
// stay as they were, since they only matter while GameMate is in use.
export function withdrawTerms(): Settings {
  const next = { ...getSettings(), termsVersion: 0, termsAcceptedAt: '' }
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

// Sliders and typing change settings many times a second; they are written to disk shortly
// after the last change, and right away when GameMate quits.
const WRITE_DELAY_MS = 500
let writeTimer: NodeJS.Timeout | null = null

// Writes the settings now. A temporary file is renamed over the old one, so a crash mid-write
// can't leave a half-written settings file behind.
export function flushSettings(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = null
  if (!current) return
  try {
    const temp = `${file()}.tmp`
    writeFileSync(temp, JSON.stringify(current, null, 2))
    renameSync(temp, file())
  } catch (error) {
    console.error('Could not save settings', error)
  }
}

function save(next: Settings): void {
  current = next
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(flushSettings, WRITE_DELAY_MS)
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', next)
  for (const listener of listeners) listener(next)
}
