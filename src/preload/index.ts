import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Api,
  CompanionState,
  LocalModelStatus,
  Settings,
  SayRequest,
  SpeechModelStatus,
  UpdateState
} from './index.d'

// Subscribe to a main-process event without handing the renderer the raw IPC event.
function listen<T extends unknown[]>(channel: string, callback: (...args: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]): void => callback(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

let lastRequest = 0

// Only these narrow functions reach the renderer; ipcRenderer itself is never exposed.
const api: Api = {
  listModels: () => ipcRenderer.invoke('ollama:list-models'),
  ask: async (messages, onText) => {
    const id = ++lastRequest
    const stop = onText
      ? listen<[number, string]>('assistant:text', (requestId, text) => {
          if (requestId === id) onText(text)
        })
      : () => {}
    try {
      return await ipcRenderer.invoke('assistant:ask', messages, id, !!onText)
    } finally {
      stop()
    }
  },
  // Stops the question this window asked last, if it is still being answered.
  stopAsking: () => ipcRenderer.invoke('assistant:stop', lastRequest),
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  captureScreenshot: (sourceId) => ipcRenderer.invoke('capture:screenshot', sourceId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  onSettingsChanged: (callback) => listen<[Settings]>('settings:changed', callback),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  systemLanguage: () => ipcRenderer.invoke('app:system-language'),
  companion: {
    getState: () => ipcRenderer.invoke('companion:get-state'),
    setPaused: (paused) => ipcRenderer.invoke('companion:set-paused', paused),
    clearEvents: () => ipcRenderer.invoke('companion:clear-events'),
    onState: (callback) => listen<[CompanionState]>('companion:state', callback)
  },
  gemini: {
    status: () => ipcRenderer.invoke('gemini:status'),
    setKey: (key) => ipcRenderer.invoke('gemini:set-key', key),
    clearKey: () => ipcRenderer.invoke('gemini:clear-key'),
    models: () => ipcRenderer.invoke('gemini:models')
  },
  openSource: (url) => ipcRenderer.invoke('app:open-source', url),
  deleteData: () => ipcRenderer.invoke('app:delete-data'),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  quit: () => ipcRenderer.invoke('app:quit'),
  pauseShortcuts: (paused) => ipcRenderer.invoke('shortcuts:pause', paused),
  legal: {
    accept: (ageConfirmed) => ipcRenderer.invoke('legal:accept', ageConfirmed),
    withdraw: () => ipcRenderer.invoke('legal:withdraw')
  },
  features: {
    apply: (choices) => ipcRenderer.invoke('features:apply', choices)
  },
  updates: {
    state: () => ipcRenderer.invoke('updates:state'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onState: (callback) => listen<[UpdateState]>('updates:state', callback)
  },
  games: {
    state: () => ipcRenderer.invoke('games:state'),
    scan: () => ipcRenderer.invoke('games:scan'),
    runningApps: () => ipcRenderer.invoke('games:running-apps'),
    add: (exe, name) => ipcRenderer.invoke('games:add', exe, name),
    remove: (id) => ipcRenderer.invoke('games:remove', id),
    setWiki: (id, address) => ipcRenderer.invoke('games:set-wiki', id, address),
    wikiChoices: (id) => ipcRenderer.invoke('games:wiki-choices', id)
  },
  modpacks: {
    list: () => ipcRenderer.invoke('modpacks:list'),
    current: () => ipcRenderer.invoke('modpacks:current')
  },
  localModels: {
    list: () => ipcRenderer.invoke('local-models:list'),
    download: (id) => ipcRenderer.invoke('local-models:download', id),
    cancel: (id) => ipcRenderer.invoke('local-models:cancel', id),
    remove: (id) => ipcRenderer.invoke('local-models:remove', id),
    onChange: (callback) => listen<[LocalModelStatus[]]>('local-models:changed', callback)
  },
  voice: {
    models: () => ipcRenderer.invoke('voice:models'),
    voices: () => ipcRenderer.invoke('voice:voices'),
    openWindowsVoices: () => ipcRenderer.invoke('voice:open-windows-voices'),
    speak: (text) => ipcRenderer.invoke('voice:speak', text),
    stop: () => ipcRenderer.invoke('voice:stop'),
    download: (id) => ipcRenderer.invoke('voice:download', id),
    remove: (id) => ipcRenderer.invoke('voice:remove', id),
    onModels: (callback) => listen<[SpeechModelStatus[]]>('voice:models', callback),
    onSay: (callback) => listen<[SayRequest]>('voice:say', callback),
    onHush: (callback) => listen<[]>('voice:hush', callback)
  },
  session: {
    get: () => ipcRenderer.invoke('session:get'),
    update: (patch) => ipcRenderer.invoke('session:update', patch)
  },
  toast: {
    hide: () => ipcRenderer.invoke('toast:hide'),
    setHeight: (height) => ipcRenderer.invoke('toast:set-height', height),
    onShow: (callback) => listen<[string]>('toast:show', callback),
    ready: () => ipcRenderer.invoke('toast:ready'),
    doneSpeaking: () => ipcRenderer.invoke('toast:done-speaking')
  },
  overlay: {
    hide: () => ipcRenderer.invoke('overlay:hide'),
    setHeight: (height) => ipcRenderer.invoke('overlay:set-height', height),
    takeScreenshot: () => ipcRenderer.invoke('overlay:take-screenshot'),
    warmUp: () => ipcRenderer.invoke('overlay:warm-up'),
    onShown: (callback) => listen<[boolean]>('overlay:shown', callback),
    onListen: (callback) => listen('overlay:listen', callback)
  }
}

contextBridge.exposeInMainWorld('api', api)
