export type ChatRole = 'user' | 'assistant'

// A crafting recipe as a grid of ingredient labels (null = empty slot).
export interface RecipeView {
  item: string
  count: number
  shapeless: boolean
  grid: (string | null)[][]
  totals: { label: string; count: number }[]
}

export interface WikiSource {
  title: string
  url: string
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

export type SpeechModelId = 'fast' | 'accurate'
export type SpeakAnswers = 'off' | 'voice' | 'always'

export interface SpeechModelStatus {
  id: SpeechModelId
  sizeMb: number
  installed: boolean
  // 0-1 while downloading, otherwise null.
  progress: number | null
  error: string | null
}

export type Engine = 'local' | 'gemini'

export interface Settings {
  model: string
  minecraftVersion: string
  overlayScreenshot: boolean
  companionMode: CompanionMode
  commentaryFrequency: CommentaryFrequency
  voiceInput: boolean
  speechModel: SpeechModelId
  speakAnswers: SpeakAnswers
  speakComments: boolean
  voiceName: string
  voiceVolume: number
  voiceRate: number
  answersEngine: Engine
  commentaryEngine: Engine
  geminiModel: string
  webLookup: boolean
  privacyNoticeVersion: number
  geminiConsent: boolean
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
  status: 'off' | 'paused' | 'no-model' | 'waiting-for-game' | 'watching' | 'analyzing'
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
  ask: (messages: ChatMessage[]) => Promise<ChatMessage>
  listCaptureSources: () => Promise<CaptureSource[]>
  captureScreenshot: (sourceId: string) => Promise<Screenshot>
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  // Returns a function that stops listening.
  onSettingsChanged: (callback: (settings: Settings) => void) => () => void
  listMinecraftVersions: () => Promise<string[]>
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
  // Deletes the key, speech models, companion log and settings stored by GameMate.
  deleteData: () => Promise<void>
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
