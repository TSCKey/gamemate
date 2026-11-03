// The API GameMate's windows get from the preload script. The data types are shared with the
// main process (src/shared/types.ts).
import type {
  AppInfo,
  CaptureSource,
  ChatMessage,
  CompanionState,
  GamesState,
  LocalModelStatus,
  ModelInfo,
  ModpackSummary,
  RunningApp,
  SayRequest,
  Screenshot,
  Settings,
  SpeechModelId,
  SpeechModelStatus,
  UpdateState,
  WikiChoice,
  WindowsVoice
} from '../shared/types'
import type { LanguageCode } from '../shared/languages'

export type * from '../shared/types'

export interface Api {
  listModels: () => Promise<ModelInfo[]>
  // onText receives the answer so far while it is written (empty when it starts over).
  ask: (messages: ChatMessage[], onText?: (text: string) => void) => Promise<ChatMessage>
  // Stops the answer to the question this window asked last (the ■ button).
  stopAsking: () => Promise<void>
  listCaptureSources: () => Promise<CaptureSource[]>
  captureScreenshot: (sourceId: string) => Promise<Screenshot>
  getSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  // Returns a function that stops listening.
  onSettingsChanged: (callback: (settings: Settings) => void) => () => void
  getAppInfo: () => Promise<AppInfo>
  // The first of Windows' display languages that GameMate has, else English.
  systemLanguage: () => Promise<LanguageCode>
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
  // Opens the folder with GameMate's log file.
  openLogs: () => Promise<void>
  quit: () => Promise<void>
  // Pauses the in-game shortcuts while the player picks a new one.
  pauseShortcuts: (paused: boolean) => Promise<void>
  // Accepting the Terms of Use (with the age confirmation) and withdrawing that acceptance.
  legal: {
    accept: (ageConfirmed: boolean) => Promise<Settings>
    withdraw: () => Promise<Settings>
  }
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
    // The wikis found for a game, best first.
    wikiChoices: (id: string) => Promise<WikiChoice[]>
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
    // Windows text-to-speech voices, with the language each speaks.
    voices: () => Promise<WindowsVoice[]>
    // Opens Windows' Settings → Speech, where voices in more languages can be added.
    openWindowsVoices: () => Promise<void>
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
