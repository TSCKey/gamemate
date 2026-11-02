export type ChatRole = 'user' | 'assistant'

// A crafting recipe as a grid of ingredient labels (null = empty slot).
export interface RecipeView {
  item: string
  count: number
  shapeless: boolean
  grid: (string | null)[][]
  totals: { label: string; count: number }[]
}

// A wiki or mod page an answer used.
export interface WikiSource {
  title: string
  url: string
  // e.g. "Terraria Wiki" or "Modrinth"
  wiki: string
  license: string
}

export interface WikiSite {
  name: string
  api: string
  articlePath: string
  license: string
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

export type GameLauncher = 'steam' | 'epic' | 'battlenet' | 'riot' | 'manual'

// A game found by a scan or added by the player.
export interface SavedGame {
  id: string
  name: string
  launcher: GameLauncher
  installDir?: string
  exe?: string
  wiki?: WikiSite
}

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

export interface AnsweredBy {
  provider: Engine
  model: string
  // Auto mode: why this AI was picked.
  reason?: string
}

export interface ChatMessage {
  role: ChatRole
  content: string
  // Base64-encoded JPEG screenshots (no data: prefix).
  images?: string[]
  // Recipes GameMate looked up for this answer.
  recipes?: RecipeView[]
  // minecraft.wiki pages the answer used.
  sources?: WikiSource[]
  // Which AI answered (assistant messages only).
  answeredBy?: AnsweredBy
}

export interface ModelInfo {
  name: string
  vision: boolean
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

export type CompanionMode = 'disabled' | 'on-demand' | 'observation' | 'commentary' | 'quiet'
export type CommentaryFrequency = 'rare' | 'normal' | 'frequent'

export type SpeechModelId = 'fast' | 'accurate' | 'best' | 'kokoro'
export type ListenModelId = 'fast' | 'accurate' | 'best'
export type VoiceEngine = 'windows' | 'kokoro'

// A request to speak with the natural voice (handled by the pop-up window).
export interface SayRequest {
  text: string
  voice: string
  speed: number
  volume: number
}
export type SpeakAnswers = 'off' | 'voice' | 'always'

export interface SpeechModelStatus {
  id: SpeechModelId
  // Speech recognition ('listen') or GameMate's voice ('speak').
  kind: 'listen' | 'speak'
  sizeMb: number
  installed: boolean
  // 0-1 while downloading, otherwise null.
  progress: number | null
  error: string | null
}

export type Engine = 'local' | 'gemini'
export type LocalBackend = 'builtin' | 'ollama'

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
export type AnswerEngine = Engine | 'auto'

export interface Settings {
  localBackend: LocalBackend
  builtinModel: string
  model: string
  overlayScreenshot: boolean
  companionMode: CompanionMode
  commentaryFrequency: CommentaryFrequency
  voiceInput: boolean
  speechModel: ListenModelId
  speakAnswers: SpeakAnswers
  speakComments: boolean
  voiceEngine: VoiceEngine
  voiceName: string
  kokoroVoice: string
  voiceVolume: number
  voiceRate: number
  answersEngine: AnswerEngine
  commentaryEngine: Engine
  geminiModel: string
  webLookup: boolean
  privacyNoticeVersion: number
  geminiConsent: boolean
  closeToTray: boolean
  currentGame: string
  autoDetectGame: boolean
  // The player allowed GameMate to look at this PC for games.
  autoUpdate: boolean
  deviceConsent: boolean
  games: SavedGame[]
  // 'auto' (the running pack), '' (none) or a pack's folder.
  minecraftModpack: string
}

export interface ObservedEvent {
  time: number
  type: 'hostile_mob' | 'low_health' | 'death' | 'dark_area' | 'discovery' | 'other'
  importance: number
  description: string
  comment: string
  spoken: boolean
}

export interface CompanionState {
  status:
    'off' | 'paused' | 'no-model' | 'needs-consent' | 'waiting-for-game' | 'watching' | 'analyzing'
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

export interface Api {
  listModels: () => Promise<ModelInfo[]>
  // onText receives the answer so far while it is written (empty when it starts over).
  ask: (messages: ChatMessage[], onText?: (text: string) => void) => Promise<ChatMessage>
  listCaptureSources: () => Promise<CaptureSource[]>
  captureScreenshot: (sourceId: string) => Promise<Screenshot>
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  // Returns a function that stops listening.
  onSettingsChanged: (callback: (settings: Settings) => void) => () => void
  getAppInfo: () => Promise<AppInfo>
  companion: {
    getState: () => Promise<CompanionState>
    setPaused: (paused: boolean) => Promise<void>
    clearEvents: () => Promise<void>
    onState: (callback: (state: CompanionState) => void) => () => void
  }
  gemini: {
    status: () => Promise<{ hasKey: boolean }>
    // Checks the key with Google, stores it encrypted, and returns the available models.
    setKey: (key: string) => Promise<string[]>
    clearKey: () => Promise<void>
    models: () => Promise<string[]>
  }
  // Opens a minecraft.wiki page (or one of GameMate's policy links) in the default browser.
  openSource: (url: string) => Promise<void>
  // Deletes the key, AI and speech models, companion log and settings stored by GameMate.
  deleteData: () => Promise<void>
  updates: {
    state: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    // Restarts GameMate and installs the downloaded update.
    install: () => Promise<void>
    onState: (callback: (state: UpdateState) => void) => () => void
  }
  games: {
    state: () => Promise<GamesState>
    // Looks through Steam, Epic, Battle.net and Riot, and finds each game's wiki.
    scan: () => Promise<GamesState>
    runningApps: () => Promise<RunningApp[]>
    add: (exe: string, name: string) => Promise<GamesState>
    remove: (id: string) => Promise<GamesState>
    // Finds the wiki from any page address ('' removes it).
    setWiki: (id: string, address: string) => Promise<GamesState>
  }
  modpacks: {
    // Packs installed with CurseForge, most recently played first.
    list: () => Promise<ModpackSummary[]>
    // The pack GameMate is using now (chosen, or the one running), if any.
    current: () => Promise<ModpackSummary | null>
  }
  // Models for the built-in engine: download (resolves when done), cancel, delete.
  localModels: {
    list: () => Promise<LocalModelStatus[]>
    download: (id: string) => Promise<void>
    cancel: (id: string) => Promise<void>
    remove: (id: string) => Promise<void>
    onChange: (callback: (models: LocalModelStatus[]) => void) => () => void
  }
  voice: {
    models: () => Promise<SpeechModelStatus[]>
    // Windows text-to-speech voices.
    voices: () => Promise<string[]>
    // Speaks with the voice, volume and speed from settings, replacing anything still playing.
    speak: (text: string) => Promise<void>
    stop: () => Promise<void>
    download: (id: SpeechModelId) => Promise<void>
    remove: (id: SpeechModelId) => Promise<void>
    onModels: (callback: (models: SpeechModelStatus[]) => void) => () => void
    // For the pop-up window, which speaks with the natural voice.
    onSay: (callback: (request: SayRequest) => void) => () => void
    onHush: (callback: () => void) => () => void
  }
  toast: {
    hide: () => Promise<void>
    setHeight: (height: number) => Promise<void>
    onShow: (callback: (text: string) => void) => () => void
  }
  overlay: {
    hide: () => Promise<void>
    setHeight: (height: number) => Promise<void>
    takeScreenshot: () => Promise<Screenshot | null>
    // listen is true when opened with the voice shortcut.
    onShown: (callback: (listen: boolean) => void) => () => void
    // The voice shortcut was pressed while the window was already open.
    onListen: (callback: () => void) => () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}
