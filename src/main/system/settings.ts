// User settings shared by the main window and the floating window, saved to userData.
import { app, BrowserWindow } from 'electron'
import { readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { isListenModelId, isSpeechModelInstalled } from '../voice/voiceModels'
import { migrateVoiceEngine } from '../voice/migrate'
import { isLocalModelId, LOCAL_MODELS } from '../ai/localModels'
import type { SavedGame } from '../games/catalog'
import { existsSync } from 'fs'
import { DEFAULT_SHORTCUT, DEFAULT_VOICE_SHORTCUT, isValidShortcut } from '../../shared/shortcuts'
import { isLanguageCode, languageInfo } from '../../shared/languages'
import { isKokoroVoice } from '../../shared/voices'
import {
  COMPANION_MODES,
  COMMENTARY_FREQUENCIES,
  COMMENTARY_CATEGORIES,
  COMMENTARY_HUMOR_LEVELS,
  REACTION_INTENSITIES,
  SPEAK_ANSWERS,
  SUPERTONIC_VOICES,
  VOICE_ENGINES,
  ENGINES,
  LOCAL_BACKENDS,
  ANSWER_ENGINES,
  TERMS_VERSION
} from '../../shared/types'
import type {
  CompanionMode,
  CommentaryCategories,
  CommentaryFrequency,
  CommentaryHumor,
  ReactionIntensity,
  SpeakAnswers,
  SupertonicVoice,
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

const ALL_CATEGORIES = Object.fromEntries(
  COMMENTARY_CATEGORIES.map((category) => [category, true])
) as CommentaryCategories

const DEFAULTS: Settings = {
  // New players get the built-in engine: no other install needed.
  localBackend: 'builtin',
  builtinModel: LOCAL_MODELS[0].id,
  // Most gaming PCs have little graphics memory to spare beside a game.
  saveGraphicsMemory: true,
  model: '',
  overlayScreenshot: true,
  // Watching the screen is opt-in.
  companionMode: 'on-demand',
  commentaryFrequency: 'normal',
  commentaryIntensity: 'normal',
  commentaryHumor: 'light',
  commentaryCategories: ALL_CATEGORIES,
  commentaryTactics: true,
  commentaryPlayerNames: '',
  showComments: true,
  hideCommentsInFullscreen: false,
  voiceInput: false,
  speechModel: 'accurate',
  speakAnswers: 'voice',
  speakComments: false,
  voiceEngine: 'kokoro',
  kokoroVoice: 'af_heart',
  naturalVoice: 'F1',
  voiceVolume: 1,
  voiceRate: 1,
  voiceNoticeShown: false,
  // Everything stays local until the player chooses otherwise.
  answersEngine: 'local',
  commentaryEngine: 'local',
  // Turned on when the player downloads the comment writer.
  commentaryModel: false,
  geminiModel: '',
  webLookup: false,
  webSearch: false,
  detailedAnswers: false,
  language: '',
  termsVersion: 0,
  termsAcceptedAt: '',
  consents: {},
  geminiConsent: false,
  closeToTray: true,
  featureChoices: 'ask',
  chatScreenshot: false,
  autoUpdate: true,
  shortcut: DEFAULT_SHORTCUT,
  voiceShortcut: DEFAULT_VOICE_SHORTCUT,
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

const installedVoices = (): Record<'kokoro' | 'supertonic', boolean> => ({
  kokoro: isSpeechModelInstalled('kokoro'),
  supertonic: isSpeechModelInstalled('supertonic')
})

const file = (): string => join(app.getPath('userData'), 'settings.json')
let current: Settings | null = null

export function getSettings(): Settings {
  if (!current) {
    try {
      const saved = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>
      current = {
        ...DEFAULTS,
        ...saved,
        commentaryCategories: { ...ALL_CATEGORIES, ...saved.commentaryCategories }
      }
      // From before GameMate recorded consent dates: the consent stands, its date is unknown.
      current.consents = {
        ...(current.geminiConsent ? { gemini: '' } : {}),
        ...(current.deviceConsent ? { games: '' } : {}),
        ...(current.webLookup ? { lookups: '' } : {}),
        ...(current.webSearch ? { search: '' } : {}),
        ...saved.consents
      }
      // A language GameMate no longer offers becomes English; never chosen stays unchosen.
      if (current.language !== '' && !isLanguageCode(current.language)) current.language = 'en'
      // Players who set GameMate up with Ollama before the built-in engine existed keep it.
      if (saved.localBackend === undefined && saved.model) current.localBackend = 'ollama'
      // Players who already accepted the Terms before this screen existed aren't asked again.
      if (saved.featureChoices === undefined) {
        current.featureChoices = (saved.termsVersion ?? 0) > 0 ? 'answered' : 'ask'
      }
      // Windows voices are gone: Kokoro or Supertonic, whichever speaks the language (one
      // already downloaded first). Runs at every launch, so a voice the player chose is kept.
      current.voiceEngine = migrateVoiceEngine(
        saved.voiceEngine,
        current.language || 'en',
        installedVoices()
      )
      // Kokoro's female or male voice (as earlier builds saved it) becomes its usual voice.
      if (!isKokoroVoice(current.kokoroVoice)) {
        current.kokoroVoice = current.kokoroVoice === 'male' ? 'am_michael' : 'af_heart'
      }
      delete (current as Settings & { voiceName?: string }).voiceName
    } catch {
      current = { ...DEFAULTS }
    }
  }
  return current
}

// Renderer input is untrusted: only accept known keys with the right types.
const MAX_PLAYER_NAMES = 120

export function updateSettings(patch: unknown): Settings {
  if (typeof patch !== 'object' || patch === null) throw new Error('Invalid settings.')
  const p = patch as Record<string, unknown>
  const next = { ...getSettings() }
  if (LOCAL_BACKENDS.includes(p.localBackend as LocalBackend)) {
    next.localBackend = p.localBackend as LocalBackend
  }
  if (isLocalModelId(p.builtinModel)) next.builtinModel = p.builtinModel
  if (typeof p.saveGraphicsMemory === 'boolean') next.saveGraphicsMemory = p.saveGraphicsMemory
  if (typeof p.model === 'string') next.model = p.model.slice(0, 200)
  if (typeof p.overlayScreenshot === 'boolean') next.overlayScreenshot = p.overlayScreenshot
  if (COMPANION_MODES.includes(p.companionMode as CompanionMode)) {
    next.companionMode = p.companionMode as CompanionMode
  }
  if (COMMENTARY_FREQUENCIES.includes(p.commentaryFrequency as CommentaryFrequency)) {
    next.commentaryFrequency = p.commentaryFrequency as CommentaryFrequency
  }
  if (REACTION_INTENSITIES.includes(p.commentaryIntensity as ReactionIntensity)) {
    next.commentaryIntensity = p.commentaryIntensity as ReactionIntensity
  }
  if (COMMENTARY_HUMOR_LEVELS.includes(p.commentaryHumor as CommentaryHumor)) {
    next.commentaryHumor = p.commentaryHumor as CommentaryHumor
  }
  if (typeof p.commentaryCategories === 'object' && p.commentaryCategories !== null) {
    const changes = p.commentaryCategories as Record<string, unknown>
    next.commentaryCategories = { ...next.commentaryCategories }
    for (const category of COMMENTARY_CATEGORIES) {
      const value = changes[category]
      if (typeof value === 'boolean') next.commentaryCategories[category] = value
    }
  }
  if (typeof p.commentaryTactics === 'boolean') next.commentaryTactics = p.commentaryTactics
  if (typeof p.commentaryPlayerNames === 'string') {
    next.commentaryPlayerNames = p.commentaryPlayerNames
      .replace(/\p{Cc}+/gu, ' ')
      .trim()
      .slice(0, MAX_PLAYER_NAMES)
  }
  if (typeof p.showComments === 'boolean') next.showComments = p.showComments
  if (typeof p.hideCommentsInFullscreen === 'boolean') {
    next.hideCommentsInFullscreen = p.hideCommentsInFullscreen
  }
  if (typeof p.voiceInput === 'boolean') next.voiceInput = p.voiceInput
  if (isListenModelId(p.speechModel)) next.speechModel = p.speechModel
  if (SPEAK_ANSWERS.includes(p.speakAnswers as SpeakAnswers)) {
    next.speakAnswers = p.speakAnswers as SpeakAnswers
  }
  if (typeof p.speakComments === 'boolean') next.speakComments = p.speakComments
  // A comment has to reach the player somehow.
  if (!next.speakComments) next.showComments = true
  if (VOICE_ENGINES.includes(p.voiceEngine as VoiceEngine))
    next.voiceEngine = p.voiceEngine as VoiceEngine
  if (isKokoroVoice(p.kokoroVoice)) next.kokoroVoice = p.kokoroVoice
  if (SUPERTONIC_VOICES.includes(p.naturalVoice as SupertonicVoice)) {
    next.naturalVoice = p.naturalVoice as SupertonicVoice
  }
  const num = (v: unknown, min: number, max: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null
  next.voiceVolume = num(p.voiceVolume, 0, 1) ?? next.voiceVolume
  next.voiceRate = num(p.voiceRate, 0.5, 2) ?? next.voiceRate
  if (typeof p.voiceNoticeShown === 'boolean') next.voiceNoticeShown = p.voiceNoticeShown
  if (ANSWER_ENGINES.includes(p.answersEngine as AnswerEngine)) {
    next.answersEngine = p.answersEngine as AnswerEngine
  }
  if (ENGINES.includes(p.commentaryEngine as Engine)) {
    next.commentaryEngine = p.commentaryEngine as Engine
  }
  if (typeof p.commentaryModel === 'boolean') next.commentaryModel = p.commentaryModel
  if (typeof p.geminiModel === 'string' && /^[\w.-]{0,100}$/.test(p.geminiModel)) {
    next.geminiModel = p.geminiModel
  }
  if (isLanguageCode(p.language)) {
    // The first language chosen (on a first start, or after updating from a GameMate without
    // languages) comes with a voice that speaks it, unless the voice was chosen with it.
    // Later changes keep the voice; the settings say when it can't speak the language.
    const voices = languageInfo(p.language).voices
    if (next.language === '' && p.voiceEngine === undefined && !voices.includes(next.voiceEngine)) {
      next.voiceEngine = migrateVoiceEngine(undefined, p.language, installedVoices())
    }
    next.language = p.language
  }
  if (typeof p.webLookup === 'boolean') next.webLookup = p.webLookup
  if (typeof p.webSearch === 'boolean') next.webSearch = p.webSearch
  if (typeof p.detailedAnswers === 'boolean') next.detailedAnswers = p.detailedAnswers
  if (typeof p.geminiConsent === 'boolean') next.geminiConsent = p.geminiConsent
  if (typeof p.closeToTray === 'boolean') next.closeToTray = p.closeToTray
  // The screen can be answered, never reopened from a page.
  if (p.featureChoices === 'answered') next.featureChoices = 'answered'
  if (typeof p.chatScreenshot === 'boolean') next.chatScreenshot = p.chatScreenshot
  if (typeof p.deviceConsent === 'boolean') next.deviceConsent = p.deviceConsent
  if (typeof p.autoUpdate === 'boolean') next.autoUpdate = p.autoUpdate
  if (isValidShortcut(p.shortcut)) next.shortcut = p.shortcut
  if (isValidShortcut(p.voiceShortcut)) next.voiceShortcut = p.voiceShortcut
  // The two shortcuts must differ; a change that makes them equal is ignored.
  if (next.shortcut === next.voiceShortcut) {
    next.shortcut = getSettings().shortcut
    next.voiceShortcut = getSettings().voiceShortcut
  }
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
  // Nothing goes to Google without the player's consent (web search goes through Gemini too).
  if (!next.geminiConsent) {
    next.answersEngine = 'local'
    next.commentaryEngine = 'local'
    next.webSearch = false
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
    lookups: date(next.webLookup, next.consents.lookups),
    search: date(next.webSearch, next.consents.search)
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
