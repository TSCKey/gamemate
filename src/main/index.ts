import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
  session,
  ipcMain,
  Menu,
  nativeImage,
  Tray
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { listModels, type ChatMessage } from './ollamaClient'
import { captureSource, listSources } from './capture'
import { ask, type AssistantReply } from './assistant'
import type { LlmEngine } from './llm'
import { isUnreachable, routeQuestion } from './engines'
import { listGeminiModels } from './gemini'
import { clearGeminiKey, getGeminiKey, hasGeminiKey, setGeminiKey } from './secrets'
import { listVersions } from './games/minecraft'
import {
  getSettings,
  onSettingsChanged,
  resetSettings,
  updateSettings,
  type Settings
} from './settings'
import {
  createOverlay,
  hideOverlay,
  setOverlayHeight,
  takePendingScreenshot,
  toggleOverlay
} from './overlay'
import { createToast, hideToast, setToastHeight, showToast } from './toast'
import { listVoices, shutdownSpeech, speak, stopSpeaking } from './tts'
import {
  downloadSpeechModel,
  isSpeechModelId,
  registerModelScheme,
  removeSpeechModel,
  serveModels,
  speechModelStatuses
} from './voiceModels'
import {
  clearEvents,
  getObserverState,
  onObserverState,
  recentObservations,
  setPaused,
  startObserver,
  stopObserver,
  type ObserverState
} from './observer'

const SHORTCUT = 'Alt+Space'
const VOICE_SHORTCUT = 'Alt+V'
const VALID_ROLES = new Set(['user', 'assistant'])
const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
// Policy and setup pages the settings screen links to.
const EXTERNAL_LINKS = [
  'https://aistudio.google.com/apikey',
  'https://ai.google.dev/gemini-api/terms',
  'https://policies.google.com/privacy',
  'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer'
]

const preloadPath = join(__dirname, '../preload/index.js')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let shortcutRegistered = false
let voiceShortcutRegistered = false
let quitting = false

function isImageList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 4 &&
    value.every(
      (img) =>
        typeof img === 'string' && img.length <= MAX_IMAGE_BASE64_LENGTH && BASE64_PATTERN.test(img)
    )
  )
}

// Renderer input is untrusted: check its shape and keep only known fields.
function parseChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) throw new Error('Invalid chat messages.')
  return value.map((m) => {
    if (
      typeof m !== 'object' ||
      m === null ||
      !VALID_ROLES.has(m.role) ||
      typeof m.content !== 'string' ||
      (m.images !== undefined && !isImageList(m.images))
    ) {
      throw new Error('Invalid chat messages.')
    }
    return { role: m.role, content: m.content, ...(m.images ? { images: m.images } : {}) }
  })
}

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('No window for this request.')
  return win
}

function registerHandlers(): void {
  ipcMain.handle('ollama:list-models', () => listModels())

  ipcMain.handle('assistant:ask', async (_event, messages: unknown) => {
    const history = parseChatMessages(messages)
    const { minecraftVersion, webLookup } = getSettings()
    const last = history.at(-1)
    const route = routeQuestion(last?.content ?? '', Boolean(last?.images?.length), history.length)
    const askWith = async (engine: LlmEngine, reason?: string): Promise<AssistantReply> => {
      const reply = await ask(
        { engine, minecraftVersion, webLookup, observations: recentObservations() },
        history
      )
      return reply.answeredBy ? { ...reply, answeredBy: { ...reply.answeredBy, reason } } : reply
    }
    try {
      return await askWith(route.engine, route.reason)
    } catch (error) {
      // Auto mode: if the chosen AI is offline or out of quota, the other one answers.
      if (!route.fallback || !isUnreachable(error)) throw error
      const what = route.engine.provider === 'gemini' ? 'Gemini' : 'the local model'
      return askWith(route.fallback, `${what} couldn’t be reached`)
    }
  })

  // Only wiki pages and the policy pages GameMate links to, so a page can't open arbitrary
  // programs or sites.
  ipcMain.handle('app:open-source', (_event, url: unknown) => {
    if (
      typeof url === 'string' &&
      (url.startsWith('https://minecraft.wiki/w/') || EXTERNAL_LINKS.includes(url))
    ) {
      shell.openExternal(url)
    }
  })
  // "Delete my data": everything GameMate stored on this PC, back to a fresh install.
  ipcMain.handle('app:delete-data', async () => {
    clearGeminiKey()
    clearEvents()
    await Promise.all(speechModelStatuses().map((m) => removeSpeechModel(m.id)))
    resetSettings()
  })
  ipcMain.handle('gemini:status', () => ({ hasKey: hasGeminiKey() }))
  ipcMain.handle('gemini:set-key', async (_event, key: unknown) => {
    if (!getSettings().geminiConsent) throw new Error('Agree to the Gemini terms first.')
    // Key formats change (newer ones contain dots), so only drop stray whitespace and quotes
    // from copy-pasting and require characters that are safe in a header; Google does the
    // real check below.
    const trimmed =
      typeof key === 'string' ? key.replace(/\s+/g, '').replace(/^["']|["']$/g, '') : ''
    if (!/^[\x21-\x7e]{20,300}$/.test(trimmed)) {
      throw new Error('That doesn’t look like a Gemini API key.')
    }
    // Check the key works before saving it.
    const models = await listGeminiModels(trimmed)
    setGeminiKey(trimmed)
    return models
  })
  ipcMain.handle('gemini:clear-key', () => clearGeminiKey())
  ipcMain.handle('gemini:models', () => {
    const key = getGeminiKey()
    return key ? listGeminiModels(key) : []
  })

  ipcMain.handle('capture:list-sources', (event) => listSources(senderWindow(event)))

  ipcMain.handle('capture:screenshot', (event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || !/^(screen|window):[\w:-]+$/.test(sourceId)) {
      throw new Error('Invalid capture source.')
    }
    return captureSource(sourceId, senderWindow(event))
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_event, patch: unknown) =>
    updateSettings(patch, listVersions())
  )
  ipcMain.handle('minecraft:versions', () => listVersions())
  ipcMain.handle('app:info', () => ({
    shortcut: SHORTCUT,
    shortcutRegistered,
    voiceShortcut: VOICE_SHORTCUT,
    voiceShortcutRegistered
  }))

  ipcMain.handle('voice:models', () => speechModelStatuses())
  ipcMain.handle('voice:voices', () => listVoices())
  ipcMain.handle('voice:speak', (_event, text: unknown) => {
    if (typeof text !== 'string') return
    const { voiceName, voiceVolume, voiceRate } = getSettings()
    speak(text, { voice: voiceName, volume: voiceVolume, rate: voiceRate })
  })
  ipcMain.handle('voice:stop', () => stopSpeaking())
  ipcMain.handle('voice:download', (_event, id: unknown) => {
    if (isSpeechModelId(id)) downloadSpeechModel(id)
  })
  ipcMain.handle('voice:remove', (_event, id: unknown) =>
    isSpeechModelId(id) ? removeSpeechModel(id) : undefined
  )

  ipcMain.handle('overlay:hide', () => hideOverlay())
  ipcMain.handle('overlay:set-height', (_event, height: unknown) => setOverlayHeight(height))
  ipcMain.handle('overlay:take-screenshot', () => takePendingScreenshot())

  ipcMain.handle('toast:hide', () => hideToast())
  ipcMain.handle('toast:set-height', (_event, height: unknown) => setToastHeight(height))

  ipcMain.handle('companion:get-state', () => getObserverState())
  ipcMain.handle('companion:set-paused', (_event, paused: unknown) => {
    if (typeof paused === 'boolean') setPaused(paused)
  })
  ipcMain.handle('companion:clear-events', () => clearEvents())
}

// HMR for renderer base on electron-vite cli.
// Load the remote URL for development or the local html file for production.
function loadRenderer(win: BrowserWindow, hash = ''): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function showMainWindow(): void {
  // The window may have been destroyed (e.g. the page closed itself); open a new one.
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#15161a',
    show: false,
    autoHideMenuBar: true,
    title: 'GameMate',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Closing the window keeps GameMate running in the tray so the shortcut still works.
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

const STATUS_LABELS: Record<ObserverState['status'], string> = {
  off: 'Not watching',
  paused: 'Watching paused',
  'no-model': 'Pick a model to start watching',
  'waiting-for-game': 'Waiting for Minecraft',
  watching: 'Watching Minecraft',
  analyzing: 'Watching Minecraft'
}

function updateTray(observer: ObserverState): void {
  if (!tray) return
  const watching = observer.status !== 'off'
  tray.setToolTip(`GameMate · ${STATUS_LABELS[observer.status]}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: STATUS_LABELS[observer.status], enabled: false },
      ...(watching
        ? [
            {
              label: observer.paused ? 'Resume watching' : 'Pause watching',
              click: () => setPaused(!observer.paused)
            }
          ]
        : []),
      { type: 'separator' },
      { label: `Ask GameMate (${SHORTCUT})`, click: () => toggleOverlay() },
      { label: 'Open GameMate', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Quit GameMate',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.on('double-click', showMainWindow)
  updateTray(getObserverState())
  onObserverState(updateTray)
}

// The voice shortcut only exists while voice input is on, so the key stays free for games.
function updateVoiceShortcut(settings: Settings): void {
  const active = globalShortcut.isRegistered(VOICE_SHORTCUT)
  if (settings.voiceInput && !active) {
    voiceShortcutRegistered = globalShortcut.register(VOICE_SHORTCUT, () => toggleOverlay(true))
    if (!voiceShortcutRegistered) console.warn(`Could not register ${VOICE_SHORTCUT}`)
  } else if (!settings.voiceInput && active) {
    globalShortcut.unregister(VOICE_SHORTCUT)
    voiceShortcutRegistered = false
  }
}

// GameMate's own pages may use the microphone (for voice questions) and nothing else.
function restrictPermissions(): void {
  const ownPage = (url: string): boolean =>
    url.startsWith('file://') ||
    (is.dev &&
      !!process.env['ELECTRON_RENDERER_URL'] &&
      url.startsWith(process.env['ELECTRON_RENDERER_URL']))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const audioOnly =
      permission === 'media' &&
      'mediaTypes' in details &&
      (details.mediaTypes ?? []).every((t) => t === 'audio')
    callback(audioOnly && ownPage(contents.getURL()) && getSettings().voiceInput)
  })
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, origin) => permission === 'media' && ownPage(origin)
  )
}

registerModelScheme()

// Only one GameMate may run: a second launch just opens the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.gamemate.app')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerHandlers()
    restrictPermissions()
    serveModels()
    createWindow()
    createOverlay(loadRenderer, preloadPath)
    createToast(loadRenderer, preloadPath)
    createTray()
    startObserver(showToast)

    // Fails if another app (e.g. PowerToys Run) already owns the shortcut.
    shortcutRegistered = globalShortcut.register(SHORTCUT, () => toggleOverlay())
    if (!shortcutRegistered) console.warn(`Could not register ${SHORTCUT}`)
    updateVoiceShortcut(getSettings())
    onSettingsChanged(updateVoiceShortcut)
    // Withdrawing consent for Gemini also forgets the key.
    let geminiConsent = getSettings().geminiConsent
    onSettingsChanged((settings) => {
      if (geminiConsent && !settings.geminiConsent) clearGeminiKey()
      geminiConsent = settings.geminiConsent
    })

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  stopObserver()
  shutdownSpeech()
  globalShortcut.unregisterAll()
})

// GameMate lives in the tray, so closing every window doesn't quit it.
app.on('window-all-closed', () => {})
