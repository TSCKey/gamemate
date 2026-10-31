import { contextBridge, ipcRenderer } from 'electron'
import type { Api, ChatMessage } from './index.d'

// Only these narrow functions reach the renderer; ipcRenderer itself is never exposed.
const api: Api = {
  listModels: () => ipcRenderer.invoke('ollama:list-models'),
  chat: (model: string, messages: ChatMessage[]) =>
    ipcRenderer.invoke('ollama:chat', model, messages),
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  captureScreenshot: (sourceId: string) => ipcRenderer.invoke('capture:screenshot', sourceId)
}

contextBridge.exposeInMainWorld('api', api)
