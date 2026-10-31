export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  // Base64-encoded JPEG screenshots (no data: prefix).
  images?: string[]
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

export interface Api {
  listModels: () => Promise<ModelInfo[]>
  chat: (model: string, messages: ChatMessage[]) => Promise<ChatMessage>
  listCaptureSources: () => Promise<CaptureSource[]>
  captureScreenshot: (sourceId: string) => Promise<Screenshot>
}

declare global {
  interface Window {
    api: Api
  }
}
