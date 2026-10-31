import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
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
import { ask } from './assistant'
import { listVersions } from './games/minecraft'
import { getSettings, updateSettings } from './settings'
import {
  createOverlay,
  hideOverlay,
  setOverlayHeight,
  takePendingScreenshot,
  toggleOverlay
} from './overlay'

const SHORTCUT = 'Alt+Space'
const VALID_ROLES = new Set(['user', 'assistant'])
const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

const preloadPath = join(__dirname, '../preload/index.js')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let shortcutRegistered = false
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

  ipcMain.handle('assistant:ask', (_event, messages: unknown) => {
    const { model, minecraftVersion } = getSettings()
    if (!model) throw new Error('Pick a model in GameMate first.')
    return ask({ model, minecraftVersion }, parseChatMessages(messages))
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
  ipcMain.handle('app:info', () => ({ shortcut: SHORTCUT, shortcutRegistered }))

  ipcMain.handle('overlay:hide', () => hideOverlay())
  ipcMain.handle('overlay:set-height', (_event, height: unknown) => setOverlayHeight(height))
  ipcMain.handle('overlay:take-screenshot', () => takePendingScreenshot())
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
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('GameMate')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Ask GameMate (${SHORTCUT})`, click: toggleOverlay },
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
  tray.on('double-click', showMainWindow)
}

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
    createWindow()
    createOverlay(loadRenderer, preloadPath)
    createTray()

    // Fails if another app (e.g. PowerToys Run) already owns the shortcut.
    shortcutRegistered = globalShortcut.register(SHORTCUT, toggleOverlay)
    if (!shortcutRegistered) console.warn(`Could not register ${SHORTCUT}`)

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
  globalShortcut.unregisterAll()
})

// GameMate lives in the tray, so closing every window doesn't quit it.
app.on('window-all-closed', () => {})
