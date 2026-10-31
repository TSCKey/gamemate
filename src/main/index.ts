import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { chat, listModels, type ChatMessage } from './ollamaClient'
import { captureSource, listSources } from './capture'

const VALID_ROLES = new Set(['system', 'user', 'assistant'])
const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

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

// Renderer input is untrusted: check its shape before forwarding to Ollama.
function isChatMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (m) =>
        typeof m === 'object' &&
        m !== null &&
        VALID_ROLES.has((m as ChatMessage).role) &&
        typeof (m as ChatMessage).content === 'string' &&
        ((m as ChatMessage).images === undefined || isImageList((m as ChatMessage).images))
    )
  )
}

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('No window for this request.')
  return win
}

function registerCaptureHandlers(): void {
  ipcMain.handle('capture:list-sources', (event) => listSources(senderWindow(event)))

  ipcMain.handle('capture:screenshot', (event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || !/^(screen|window):[\w:-]+$/.test(sourceId)) {
      throw new Error('Invalid capture source.')
    }
    return captureSource(sourceId, senderWindow(event))
  })
}

function registerOllamaHandlers(): void {
  ipcMain.handle('ollama:list-models', () => listModels())

  ipcMain.handle('ollama:chat', (_event, model: unknown, messages: unknown) => {
    if (typeof model !== 'string' || model.length === 0) {
      throw new Error('A model name is required.')
    }
    if (!isChatMessages(messages)) {
      throw new Error('Invalid chat messages.')
    }
    return chat(model, messages)
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerOllamaHandlers()
  registerCaptureHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
