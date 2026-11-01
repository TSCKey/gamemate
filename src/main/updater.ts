// Updates: checks GameMate's GitHub Releases, downloads a new version in the background and
// installs it when GameMate quits (or right away when the player asks). Only runs in the
// installed app; the check sends nothing but the request for the latest version.
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getSettings, onSettingsChanged } from './settings'

const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60_000

export interface UpdateState {
  status: 'dev' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  version: string
  // The new version, while downloading or ready.
  available?: string
  // 0-1 while downloading.
  progress?: number
  error?: string
  checkedAt?: number
}

let state: UpdateState = { status: 'idle', version: app.getVersion() }
let timer: NodeJS.Timeout | null = null

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updates:state', state)
}

export function updateState(): UpdateState {
  return state
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') {
    return state
  }
  setState({ status: 'checking', error: undefined })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // A repository without any release yet is simply "up to date".
    if (/no published versions|404|latest\.yml/i.test(message)) {
      setState({ status: 'none', checkedAt: Date.now() })
    } else {
      setState({ status: 'error', error: 'Couldn’t check for updates. Are you online?' })
    }
  }
  return state
}

export function installUpdate(): void {
  if (state.status === 'ready') autoUpdater.quitAndInstall(true, true)
}

function schedule(): void {
  if (timer) clearInterval(timer)
  timer = null
  if (!getSettings().autoUpdate) return
  timer = setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
  timer.unref()
}

export function startUpdater(): void {
  if (!app.isPackaged) {
    state = { status: 'dev', version: app.getVersion() }
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('update-available', (info) =>
    setState({ status: 'downloading', available: info.version, progress: 0 })
  )
  autoUpdater.on('update-not-available', () => setState({ status: 'none', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) => setState({ progress: p.percent / 100 }))
  autoUpdater.on('update-downloaded', (info) =>
    setState({ status: 'ready', available: info.version, progress: 1 })
  )
  autoUpdater.on('error', () => {
    if (state.status === 'downloading') {
      setState({
        status: 'error',
        error: 'The update couldn’t be downloaded. It will try again later.'
      })
    }
  })
  let auto = getSettings().autoUpdate
  onSettingsChanged((settings) => {
    if (settings.autoUpdate !== auto) {
      auto = settings.autoUpdate
      schedule()
    }
  })
  schedule()
  if (auto) setTimeout(() => void checkForUpdates(), FIRST_CHECK_MS).unref()
}
