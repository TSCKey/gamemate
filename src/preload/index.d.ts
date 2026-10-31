export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface Api {
  listModels: () => Promise<string[]>
  chat: (model: string, messages: ChatMessage[]) => Promise<ChatMessage>
}

declare global {
  interface Window {
    api: Api
  }
}
