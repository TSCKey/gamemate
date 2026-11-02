import { app, BrowserWindow, globalShortcut, session, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { unloadModels } from './ollamaClient'
import { warmUp } from './engines'
import { runningModel, stopEngine } from './llamaEngine'
import { startUpdater } from './updater'
import { clearGeminiKey } from './secrets'
import { followForegroundGame } from './games/current'
import { hardenWindows } from './security'
import { allowedLink } from './links'
import { registerAppHandlers } from './ipc/app'
import { registerAssistantHandlers } from './ipc/assistant'
import { registerGameHandlers } from './ipc/games'
import { registerModelHandlers } from './ipc/models'
import { registerVoiceHandlers } from './ipc/voice'
import { startLogging } from './log'
import { flushSettings, getSettings, onSettingsChanged, type Settings } from './settings'
import { createOverlay, toggleOverlay } from './overlay'
import { createToast, showToast } from './toast'
import { shutdownSpeech } from './tts'
import { registerModelScheme, serveModels } from './voiceModels'
import {
  getObserverState,
  onObserverState,
  setPaused,
  startObserver,
  stopObserver,
  type ObserverState
} from './observer'

const SHORTCUT = 'Alt+Space'
const VOICE_SHORTCUT = 'Alt+V'

const preloadPath = join(__dirname, '../preload/index.js')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let shortcutRegistered = false
let voiceShortcutRegistered = false
let quitting = false

function registerHandlers(): void {
  registerAssistantHandlers()
  registerGameHandlers()
  registerModelHandlers()
  registerVoiceHandlers()
  registerAppHandlers(() => ({
    shortcut: SHORTCUT,
    shortcutRegistered,
    voiceShortcut: VOICE_SHORTCUT,
    voiceShortcutRegistered
  }))
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

  // Closing the window keeps GameMate running in the tray so the shortcuts still work,
  // unless the player turned that off.
  mainWindow.on('close', (event) => {
    if (quitting) return
    if (getSettings().closeToTray) {
      event.preventDefault()
      mainWindow?.hide()
    } else {
      // Quit once this close has gone through; quitting from inside the handler cancels it.
      setImmediate(() => app.quit())
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadRenderer(mainWindow)
}

const STATUS_LABELS: Record<ObserverState['status'], string> = {
  off: 'Not watching',
  paused: 'Watching paused',
  'no-model': 'Pick a model to start watching',
  'needs-consent': 'Allow game detection in Settings',
  'waiting-for-game': 'Waiting for a game',
  watching: 'Watching your game',
  analyzing: 'Watching your game'
}

function updateTray(observer: ObserverState): void {
  if (!tray) return
  const watching = observer.status !== 'off'
  const label =
    observer.game && observer.status !== 'waiting-for-game'
      ? STATUS_LABELS[observer.status].replace('your game', observer.game)
      : STATUS_LABELS[observer.status]
  tray.setToolTip(`GameMate · ${label}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label, enabled: false },
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
    voiceShortcutRegistered = globalShortcut.register(VOICE_SHORTCUT, () => {
      // The player is in their game: GameMate follows it before showing up.
      followForegroundGame()
      warmUp()
      toggleOverlay(true)
    })
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
// Lets speech recognition and the natural voice use several CPU cores (WebAssembly threads).
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

startLogging()

// Only one GameMate may run: a second launch just opens the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  hardenWindows(allowedLink)

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
    startUpdater()

    // Fails if another app (e.g. PowerToys Run) already owns the shortcut.
    shortcutRegistered = globalShortcut.register(SHORTCUT, () => {
      // The player is in their game: GameMate follows it before showing up.
      followForegroundGame()
      warmUp()
      toggleOverlay()
    })
    if (!shortcutRegistered) console.warn(`Could not register ${SHORTCUT}`)
    updateVoiceShortcut(getSettings())
    onSettingsChanged(updateVoiceShortcut)
    // Free the built-in engine's memory as soon as its model is no longer the one in use.
    onSettingsChanged((settings) => {
      const running = runningModel()
      if (running && (settings.localBackend !== 'builtin' || settings.builtinModel !== running)) {
        void stopEngine()
      }
    })
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

let cleanedUp = false

app.on('will-quit', (event) => {
  if (cleanedUp) return
  // Hold the quit until the AI models are freed and the built-in engine has stopped, so
  // nothing GameMate started keeps running.
  event.preventDefault()
  cleanedUp = true
  stopObserver()
  shutdownSpeech()
  flushSettings()
  globalShortcut.unregisterAll()
  Promise.allSettled([unloadModels(), stopEngine()]).finally(() => app.quit())
})

// GameMate lives in the tray, so closing every window doesn't quit it.
app.on('window-all-closed', () => {})
