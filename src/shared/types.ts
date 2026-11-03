// Types (and the few lists of allowed values behind them) that GameMate's main process and its
// windows both use. Written once here so the two sides can't drift apart. Keep this file free of
// Electron and Node.js: it is compiled into the windows too.

import type { LanguageCode } from './languages'

// ── Settings ────────────────────────────────────────────────────────────────────────────────

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

export const VOICE_ENGINES = ['windows', 'kokoro'] as const
export type VoiceEngine = (typeof VOICE_ENGINES)[number]

export const ENGINES = ['local', 'gemini'] as const
export type Engine = (typeof ENGINES)[number]
// Where "on this PC" models run: GameMate's built-in engine, or the player's Ollama install.
export const LOCAL_BACKENDS = ['builtin', 'ollama'] as const
export type LocalBackend = (typeof LOCAL_BACKENDS)[number]

// Questions can also be routed automatically, per question.
export const ANSWER_ENGINES = [...ENGINES, 'auto'] as const
export type AnswerEngine = (typeof ANSWER_ENGINES)[number]

// The current Terms of Use and Privacy Policy (docs/TERMS.md and docs/PRIVACY.md). Bump it when
// either changes in a way players must accept again.
export const TERMS_VERSION = 1

// When the player gave each optional consent (ISO date, '' if given before GameMate kept dates).
export interface ConsentDates {
  games?: string
  lookups?: string
  gemini?: string
  search?: string
}

// Speech recognition models ('listen') and GameMate's natural voice ('speak').
export type SpeechModelId = 'fast' | 'accurate' | 'best' | 'kokoro'
export type ListenModelId = 'fast' | 'accurate' | 'best'

export interface Settings {
  // GameMate's language ('' until the player picks one at first launch).
  language: LanguageCode | ''
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
  speechModel: ListenModelId
  // Read answers aloud: never, only for questions asked by voice, or always.
  speakAnswers: SpeakAnswers
  // Read the companion's comments aloud.
  speakComments: boolean
  // GameMate's voice: Windows' built-in voices, or Kokoro (natural, needs a download).
  voiceEngine: VoiceEngine
  // Windows voice name ('' = the system default voice).
  voiceName: string
  // Kokoro voice id, e.g. 'af_heart'.
  kokoroVoice: string
  voiceVolume: number
  voiceRate: number
  // Which AI answers questions (or 'auto' to decide per question), and which watches the game:
  // the local model or Gemini (opt-in).
  answersEngine: AnswerEngine
  commentaryEngine: Engine
  // Gemini model id, e.g. from the list GameMate fetches with the player's key.
  geminiModel: string
  // Let the AI look things up on game wikis and Modrinth.
  webLookup: boolean
  // Let the AI search the web with Google, through Gemini (needs Gemini).
  webSearch: boolean
  // Long, detailed answers instead of short, direct ones.
  detailedAnswers: boolean
  // The Terms of Use version the player accepted (0 = not accepted), and when. Without the
  // current version GameMate can't be used (see termsAccepted).
  termsVersion: number
  termsAcceptedAt: string
  // When each optional consent was given, kept on this PC as the record of it.
  consents: ConsentDates
  // The player agreed to send data to Google to use Gemini (required before a key is saved).
  geminiConsent: boolean
  // Closing the window keeps GameMate in the tray (for the shortcuts and companion) instead
  // of quitting.
  closeToTray: boolean
  // Check GitHub for new versions now and then (the installed app only).
  autoUpdate: boolean
  // The keys that open the in-game window, and that open it listening for a spoken question.
  shortcut: string
  voiceShortcut: string
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

// ── Games and wikis ─────────────────────────────────────────────────────────────────────────

export type Launcher = 'steam' | 'epic' | 'battlenet' | 'riot'
export type GameLauncher = Launcher | 'manual'

// A game found by a scan or added by the player.
export interface SavedGame {
  id: string
  name: string
  launcher: GameLauncher
  installDir?: string
  exe?: string
  wiki?: WikiSite
  // The player chose this wiki, so scans keep it.
  wikiChosen?: boolean
}

// A wiki the player can pick for a game, with how big and lively it is.
export interface WikiChoice {
  name: string
  // Its address (e.g. https://terraria.wiki.gg), which identifies it.
  address: string
  articles: number
  activeUsers: number
  current: boolean
}

// What the game menus and settings show about each game.
export interface GameInfo {
  id: string
  name: string
  // The game's wiki, if GameMate knows one.
  wiki: string | null
  examples: [string, string]
  // Where it was found ('builtin' for Minecraft).
  launcher: GameLauncher | 'builtin'
  // Ranked online game: AI help during matches may break its rules.
  competitive: boolean
  exe: string | null
}

export interface GamesState {
  games: GameInfo[]
  current: string
}

// A program with an open window (to add it as a game).
export interface RunningApp {
  exe: string
  title: string
}

export interface ModpackSummary {
  name: string
  path: string
  minecraftVersion: string
  loader: string
  modCount: number
}

export interface WikiSite {
  name: string
  api: string
  articlePath: string
  license: string
}

// A wiki or mod page an answer used.
export interface WikiSource {
  title: string
  url: string
  // e.g. "Terraria Wiki" or "Modrinth"
  wiki: string
  license: string
}

// A crafting recipe as a grid of ingredient labels (null = empty slot).
export interface RecipeView {
  item: string
  count: number
  shapeless: boolean
  grid: (string | null)[][]
  totals: { label: string; count: number }[]
  // The item each ingredient label shows as its icon ("Any Planks" → "Oak Planks").
  iconItems: Record<string, string>
  // Game icons by ingredient label, and a picture of the crafted item (from the wiki).
  icons?: Record<string, string>
  picture?: WikiPicture
}

// A picture from a game's wiki: an area map, or the picture of a page's subject.
export interface WikiPicture {
  // The picture itself as a data: URL (GameMate downloads and checks it; windows never go online).
  src: string
  // What it shows, e.g. "Map of Forgotten Crossroads".
  caption: string
  // The picture's page on the wiki, which credits its source.
  url: string
  wiki: string
  kind: 'map' | 'picture'
}

// ── Chat ────────────────────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant'

export interface AnsweredBy {
  provider: Engine
  model: string
  // Auto mode: why this AI was picked.
  reason?: string
}

// A message in a conversation with GameMate.
export interface ChatMessage {
  role: ChatRole
  content: string
  // Base64-encoded JPEG screenshots (no data: prefix).
  images?: string[]
  // Recipes GameMate looked up for this answer.
  recipes?: RecipeView[]
  // Wiki and mod pages the answer used.
  sources?: WikiSource[]
  // Pictures from those wikis (maps, the things the answer is about).
  pictures?: WikiPicture[]
  // Google's Search Suggestions (HTML), shown when the answer used a web search.
  searchSuggestions?: string
  // Which AI answered (assistant messages only).
  answeredBy?: AnsweredBy
}

export interface CaptureSource {
  id: string
  name: string
  type: 'screen' | 'window'
}

export interface Screenshot {
  base64: string
  width: number
  height: number
}

// ── Models, voice and updates ───────────────────────────────────────────────────────────────

// An Ollama model and whether it can read screenshots.
export interface ModelInfo {
  name: string
  vision: boolean
}

// A model for GameMate's built-in engine, and whether it's downloaded.
export interface LocalModelStatus {
  id: string
  name: string
  // Short tier name, e.g. "Fast".
  label: string
  description: string
  sizeMb: number
  installed: boolean
  // 0-1 while downloading, otherwise null.
  progress: number | null
  error: string | null
}

export interface SpeechModelStatus {
  id: SpeechModelId
  // Speech recognition ('listen') or GameMate's voice ('speak').
  kind: 'listen' | 'speak'
  sizeMb: number
  installed: boolean
  // Only GameMate 1.0.3's English-only version of this speech model is on disk.
  englishOnly: boolean
  // The model to load: the installed one, the English-only one, or '' when neither is there.
  repo: string
  // 0-1 while downloading, otherwise null.
  progress: number | null
  error: string | null
}

// A request to speak with the natural voice (handled by the pop-up window).
export interface SayRequest {
  text: string
  voice: string
  speed: number
  volume: number
}

export interface UpdateState {
  // 'dev' when running from source (no updates).
  status: 'dev' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  version: string
  available?: string
  progress?: number
  error?: string
  checkedAt?: number
}

// ── Companion ───────────────────────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'none',
  'hostile_mob',
  'low_health',
  'death',
  'dark_area',
  'discovery',
  'other'
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface ObservedEvent {
  time: number
  type: Exclude<EventType, 'none'>
  importance: number
  description: string
  comment: string
  // Whether GameMate showed the comment to the player.
  spoken: boolean
}

export type CompanionStatus =
  'off' | 'paused' | 'no-model' | 'needs-consent' | 'waiting-for-game' | 'watching' | 'analyzing'

export interface CompanionState {
  status: CompanionStatus
  game: string | null
  paused: boolean
  events: ObservedEvent[]
}

export interface AppInfo {
  shortcut: string
  shortcutRegistered: boolean
  voiceShortcut: string
  voiceShortcutRegistered: boolean
}
