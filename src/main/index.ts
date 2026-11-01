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
import { listModels, unloadModels, type ChatMessage } from './ollamaClient'
import { captureSource, listSources } from './capture'
import { ask, type AssistantReply } from './assistant'
import type { LlmEngine } from './llm'
import { isUnreachable, routeQuestion } from './engines'
import { listGeminiModels } from './gemini'
import { runningModel, stopEngine } from './llamaEngine'
import {
  cancelLocalModel,
  downloadLocalModel,
  isLocalModelId,
  isLocalModelInstalled,
  localModelStatuses,
  removeAllLocalModels,
  removeLocalModel
} from './localModels'
import { clearGeminiKey, getGeminiKey, hasGeminiKey, setGeminiKey } from './secrets'
import { runningApps } from './games/apps'
import { allGames, currentModpack, followForegroundGame, gameContext } from './games/current'
import { scanLaunchers } from './games/launchers'
import { listCurseForgeModpacks, type ModpackSummary } from './games/modpacks'
import type { SavedGame } from './games/catalog'
import { discoverWiki, findWikiForGame } from './wiki'
import {
  getSettings,
  onSettingsChanged,
  resetSettings,
  setGames,
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
    const { webLookup } = getSettings()
    const game = await gameContext()
    const last = history.at(-1)
    const route = routeQuestion(last?.content ?? '', Boolean(last?.images?.length), history.length)
    const askWith = async (engine: LlmEngine, reason?: string): Promise<AssistantReply> => {
      const reply = await ask(
        { engine, game, webLookup, observations: recentObservations() },
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

  // Only pages on the games' wikis, Modrinth and the policy pages GameMate links to, so a page
  // can't open arbitrary programs or sites.
  ipcMain.handle('app:open-source', (_event, url: unknown) => {
    if (typeof url === 'string' && allowedLink(url)) shell.openExternal(url)
  })

  ipcMain.handle('games:state', () => gamesState())
  ipcMain.handle('games:scan', () => scanGames())
  ipcMain.handle('games:running-apps', () => {
    requireConsent()
    return runningApps()
  })
  ipcMain.handle('games:add', (_event, exe: unknown, name: unknown) => {
    requireConsent()
    if (typeof exe !== 'string' || !/^[\w .()&+'-]{1,80}\.exe$/i.test(exe)) {
      throw new Error('That program can’t be added.')
    }
    const title = typeof name === 'string' ? name.trim().slice(0, 60) : ''
    if (!title) throw new Error('Give the game a name.')
    const { games } = getSettings()
    if (games.length >= 300) throw new Error('That’s too many games.')
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
    let id = `custom-${slug || 'game'}`
    for (let n = 2; allGames().some((g) => g.id === id); n++) id = `custom-${slug || 'game'}-${n}`
    setGames([...games, { id, name: title, launcher: 'manual', exe }])
    updateSettings({ currentGame: id })
    return gamesState()
  })
  ipcMain.handle('games:remove', (_event, id: unknown) => {
    setGames(getSettings().games.filter((g) => g.id !== id))
    return gamesState()
  })
  ipcMain.handle('games:set-wiki', async (_event, id: unknown, address: unknown) => {
    const { games } = getSettings()
    const game = games.find((g) => g.id === id)
    if (!game || typeof address !== 'string') throw new Error('Unknown game.')
    const wiki = address.trim() ? await discoverWiki(address) : undefined
    setGames(games.map((g) => (g.id === game.id ? { ...g, wiki } : g)))
    return gamesState()
  })
  ipcMain.handle('modpacks:list', () => (getSettings().deviceConsent ? cachedModpackList() : []))
  ipcMain.handle('modpacks:current', async (): Promise<ModpackSummary | null> => {
    const pack = await currentModpack()
    return pack
      ? {
          name: pack.name,
          path: pack.path,
          minecraftVersion: pack.minecraftVersion,
          loader: pack.loader,
          modCount: pack.mods.length
        }
      : null
  })
  // "Delete my data": everything GameMate stored on this PC, back to a fresh install.
  ipcMain.handle('app:delete-data', async () => {
    clearGeminiKey()
    clearEvents()
    await stopEngine()
    await Promise.all([
      ...speechModelStatuses().map((m) => removeSpeechModel(m.id)),
      removeAllLocalModels()
    ])
    resetSettings()
  })

  ipcMain.handle('local-models:list', () => localModelStatuses())
  ipcMain.handle('local-models:download', async (_event, id: unknown) => {
    if (!isLocalModelId(id)) throw new Error('Unknown model.')
    const done = await downloadLocalModel(id)
    // A freshly downloaded model is used if the chosen one isn't there yet.
    if (done && !isLocalModelInstalled(getSettings().builtinModel)) {
      updateSettings({ builtinModel: id })
    }
  })
  ipcMain.handle('local-models:cancel', async (_event, id: unknown) => {
    if (isLocalModelId(id)) await cancelLocalModel(id)
  })
  ipcMain.handle('local-models:remove', async (_event, id: unknown) => {
    if (!isLocalModelId(id)) return
    if (runningModel() === id) await stopEngine()
    await removeLocalModel(id)
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
  ipcMain.handle('settings:update', (_event, patch: unknown) => updateSettings(patch))
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)
}

// What the game menus and settings need to know about each game.
function gamesState(): {
  games: {
    id: string
    name: string
    wiki: string | null
    examples: [string, string]
    launcher: SavedGame['launcher'] | 'builtin'
    competitive: boolean
    exe: string | null
  }[]
  current: string
} {
  const { games, currentGame } = getSettings()
  return {
    games: allGames().map((g) => {
      const saved = games.find((s) => s.id === g.id)
      return {
        id: g.id,
        name: g.name,
        wiki: g.wiki?.name ?? null,
        examples: g.examples,
        launcher: saved?.launcher ?? 'builtin',
        competitive: Boolean(g.competitive),
        exe: saved?.exe ?? null
      }
    }),
    current: currentGame
  }
}

function requireConsent(): void {
  if (!getSettings().deviceConsent) {
    throw new Error('Allow GameMate to look for games first (Settings → Games).')
  }
}

// "Scan for games": the launchers' libraries on this PC, then each new game's wiki (only the
// game's name is sent to wiki.gg and Fandom). Games added by hand and wikis set by the player stay.
async function scanGames(): Promise<ReturnType<typeof gamesState>> {
  requireConsent()
  const found = await scanLaunchers()
  const known = new Map(getSettings().games.map((g) => [g.id, g]))
  const scanned: SavedGame[] = []
  const queue = [...found]
  // A few at a time, so the wikis aren't flooded with requests.
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let game = queue.shift(); game; game = queue.shift()) {
        const wiki = known.get(game.id)?.wiki ?? (await findWikiForGame(game.name)) ?? undefined
        scanned.push({ ...game, wiki })
      }
    })
  )
  const manual = getSettings().games.filter((g) => g.launcher === 'manual')
  setGames([...scanned.sort((a, b) => a.name.localeCompare(b.name)), ...manual])
  return gamesState()
}

let modpackList: { at: number; list: Promise<ModpackSummary[]> } | null = null

// Reading every pack's file takes a moment, so keep the list for a little while.
function cachedModpackList(): Promise<ModpackSummary[]> {
  if (!modpackList || Date.now() - modpackList.at > 30_000) {
    modpackList = { at: Date.now(), list: listCurseForgeModpacks() }
  }
  return modpackList.list
}

function allowedLink(url: string): boolean {
  if (EXTERNAL_LINKS.includes(url)) return true
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }
  const origins = new Set(['https://modrinth.com'])
  for (const game of allGames()) {
    if (game.wiki) origins.add(new URL(game.wiki.articlePath.replace('$1', '')).origin)
  }
  return target.protocol === 'https:' && origins.has(target.origin)
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
    shortcutRegistered = globalShortcut.register(SHORTCUT, () => {
      // The player is in their game: GameMate follows it before showing up.
      followForegroundGame()
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
  globalShortcut.unregisterAll()
  Promise.allSettled([unloadModels(), stopEngine()]).finally(() => app.quit())
})

// GameMate lives in the tray, so closing every window doesn't quit it.
app.on('window-all-closed', () => {})
