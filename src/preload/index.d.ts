export type ChatRole = 'user' | 'assistant'

// A crafting recipe as a grid of ingredient labels (null = empty slot).
export interface RecipeView {
  item: string
  count: number
  shapeless: boolean
  grid: (string | null)[][]
  totals: { label: string; count: number }[]
}

export interface ChatMessage {
  role: ChatRole
  content: string
  // Base64-encoded JPEG screenshots (no data: prefix).
  images?: string[]
  // Recipes GameMate looked up for this answer.
  recipes?: RecipeView[]
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

export interface Settings {
  model: string
  minecraftVersion: string
  overlayScreenshot: boolean
}

export interface AppInfo {
  shortcut: string
  shortcutRegistered: boolean
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
  overlay: {
    hide: () => Promise<void>
    setHeight: (height: number) => Promise<void>
    takeScreenshot: () => Promise<Screenshot | null>
    onShown: (callback: () => void) => () => void
  }
}

declare global {
  interface Window {
    api: Api
  }
}
