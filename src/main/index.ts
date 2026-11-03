import { app, BrowserWindow, globalShortcut, session, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { unloadModels } from './ai/ollamaClient'
import { warmUp } from './ai/engines'
import { runningModel, stopEngine } from './ai/llamaEngine'
import { startUpdater } from './system/updater'
import { clearGeminiKey } from './system/secrets'
import { followForegroundGame } from './games/current'
import { hardenWindows } from './system/security'
import { allowedLink } from './system/links'
import { registerAppHandlers } from './ipc/app'
import { registerAssistantHandlers } from './ipc/assistant'
import { registerGameHandlers } from './ipc/games'
import { registerModelHandlers } from './ipc/models'
import { registerVoiceHandlers } from './ipc/voice'
import { registerLegalHandlers } from './ipc/legal'
import { startLogging } from './system/log'
import {
  flushSettings,
  getSettings,
  onSettingsChanged,
  termsAccepted,
  type Settings
} from './system/settings'
import { createOverlay, toggleOverlay } from './windows/overlay'
import { themeTitleBar } from './windows/titleBar'
import { createToast, showToast } from './windows/toast'
import { shutdownSpeech } from './voice/tts'
import { removeOldVoice } from './voice/migrate'
import { registerModelScheme, serveModels } from './voice/voiceModels'
import {
  getObserverState,
  onObserverState,
  setPaused,
  startObserver,
  stopObserver,
  type ObserverState
} from './companion/observer'
import { t } from './system/i18n'
import { followLanguage } from './ai/localModels'

const preloadPath = join(__dirname, '../preload/index.js')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
// The shortcuts registered right now ('' = none), and whether they are paused while the player
// picks a new one in Settings.
const registered = { main: '', voice: '' }
let shortcutsPaused = false
let quitting = false

function registerHandlers(): void {
  registerLegalHandlers()
  registerAssistantHandlers()
  registerGameHandlers()
  registerModelHandlers()
  registerVoiceHandlers()
  registerAppHandlers(
    () => {
      const settings = getSettings()
      return {
        shortcut: settings.shortcut,
        shortcutRegistered: shortcutsPaused || registered.main === settings.shortcut,
        voiceShortcut: settings.voiceShortcut,
        voiceShortcutRegistered:
          shortcutsPaused || !settings.voiceInput || registered.voice === settings.voiceShortcut
      }
    },
    (paused) => {
      shortcutsPaused = paused
      updateShortcuts(getSettings())
    }
  )
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
    // The title bar and taskbar icon (the installed app's .exe has it too).
    icon,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  themeTitleBar(mainWindow)
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

// The companion's state in the tray, with the game's name once there is one.
function trayStatus(observer: ObserverState): string {
  const status = observer.status === 'analyzing' ? 'watching' : observer.status
  if (status === 'watching' && observer.game) {
    return t('tray.status.watchingGame', { game: observer.game })
  }
  return t(`tray.status.${status}`)
}

function updateTray(observer: ObserverState): void {
  if (!tray) return
  const watching = observer.status !== 'off'
  const label = trayStatus(observer)
  tray.setToolTip(`GameMate · ${label}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label, enabled: false },
      ...(watching
        ? [
            {
              label: observer.paused ? t('tray.resume') : t('tray.pause'),
              click: () => setPaused(!observer.paused)
            }
          ]
        : []),
      { type: 'separator' },
      { label: t('tray.ask', { shortcut: getSettings().shortcut }), click: () => openOverlay() },
      { label: t('tray.open'), click: showMainWindow },
      { type: 'separator' },
      {
        label: t('tray.quit'),
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

// The in-game window, from a shortcut or the tray. Before the Terms are accepted, the main window
// opens instead, where the player can accept them.
function openOverlay(voice = false): void {
  if (!termsAccepted()) {
    showMainWindow()
    return
  }
  // The player is in their game: GameMate follows it before showing up.
  followForegroundGame()
  warmUp()
  toggleOverlay(voice)
}

// Registers the player's shortcuts, again whenever they change. The voice shortcut only exists
// while voice input is on, so the key stays free for games. Registering fails when another app
// (e.g. PowerToys Run) already owns the keys; Settings then says so.
function updateShortcuts(settings: Settings): void {
  const wanted = {
    main: shortcutsPaused ? '' : settings.shortcut,
    voice: shortcutsPaused || !settings.voiceInput ? '' : settings.voiceShortcut
  }
  const which = ['main', 'voice'] as const
  // Free the old keys first, so the two shortcuts can swap.
  for (const w of which) {
    if (registered[w] && registered[w] !== wanted[w]) {
      globalShortcut.unregister(registered[w])
      registered[w] = ''
    }
  }
  for (const w of which) {
    if (!wanted[w] || registered[w] === wanted[w]) continue
    if (globalShortcut.register(wanted[w], () => openOverlay(w === 'voice'))) {
      registered[w] = wanted[w]
    } else {
      console.warn(`Could not register ${wanted[w]}`)
    }
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
    // GameMate has no menu bar. Without this, Electron's default menu (File, Edit, View, Window)
    // pops up whenever Alt is pressed, as with the Alt + Space shortcut.
    Menu.setApplicationMenu(null)

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

    updateShortcuts(getSettings())
    onSettingsChanged(updateShortcuts)
    // The tray menu names the shortcut.
    onSettingsChanged(() => updateTray(getObserverState()))
    followLanguage()
    // Kokoro's files from GameMate 1.0.3 (340 MB) aren't used any more.
    removeOldVoice(join(app.getPath('userData'), 'models')).catch((error) =>
      console.error('Could not remove the old voice:', error)
    )
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
  Promise.allSettled([unloadModels(), stopEngine()]).finally(() => {
    // Quit again once Electron has finished with this quit: when there was nothing to clean up
    // the cleanup ends at once, and a quit asked for during this event is ignored, which left
    // GameMate running in the background. (app.exit would skip installing a downloaded update.)
    setImmediate(() => app.quit())
  })
})

// GameMate lives in the tray, so closing every window doesn't quit it.
app.on('window-all-closed', () => {})
