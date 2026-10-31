import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, Settings } from './index.d'

// Subscribe to a main-process event without handing the renderer the raw IPC event.
function listen<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]): void => callback(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Only these narrow functions reach the renderer; ipcRenderer itself is never exposed.
const api: Api = {
  listModels: () => ipcRenderer.invoke('ollama:list-models'),
  ask: (messages) => ipcRenderer.invoke('assistant:ask', messages),
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  captureScreenshot: (sourceId) => ipcRenderer.invoke('capture:screenshot', sourceId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  onSettingsChanged: (callback) => listen<[Settings]>('settings:changed', callback),
  listMinecraftVersions: () => ipcRenderer.invoke('minecraft:versions'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  overlay: {
    hide: () => ipcRenderer.invoke('overlay:hide'),
    setHeight: (height) => ipcRenderer.invoke('overlay:set-height', height),
    takeScreenshot: () => ipcRenderer.invoke('overlay:take-screenshot'),
    onShown: (callback) => listen('overlay:shown', callback)
  }
}

contextBridge.exposeInMainWorld('api', api)
