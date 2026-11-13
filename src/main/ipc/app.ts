// Settings, updates, screenshots, GameMate's small windows, the companion and the player's data.
import { BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron'
import type { AppInfo } from '../../shared/types'
import { captureSource, listSources } from '../windows/capture'
import { stopEngine } from '../ai/llamaEngine'
import { removeAllLocalModels } from '../ai/localModels'
import { allowedLink } from '../system/links'
import { deleteLogs, logFolder } from '../system/log'
import { clearEvents, getObserverState, setPaused } from '../companion/observer'
import { hideOverlay, setOverlayHeight, takePendingScreenshot } from '../windows/overlay'
import { clearGeminiKey } from '../system/secrets'
import { handle } from '../system/security'
import { getSettings, resetSettings, updateSettings } from '../system/settings'
import { hideToast, setToastHeight, toastDoneSpeaking, toastReady } from '../windows/toast'
import { warmUp } from '../ai/engines'
import { clearSession, getSession, updateSession } from '../system/session'
import { checkForUpdates, installUpdate, updateState } from '../system/updater'
import { removeSpeechModel, speechModelStatuses } from '../voice/voiceModels'
import { systemLanguage } from '../system/language'

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('No window for this request.')
  return win
}

export function registerAppHandlers(
  appInfo: () => AppInfo,
  pauseShortcuts: (paused: boolean) => void
): void {
  // While the player picks a new shortcut, the current ones don't open the in-game window.
  handle('shortcuts:pause', (_event, paused: unknown) => pauseShortcuts(paused === true))
  // Only pages on the games' wikis, Modrinth and the policy pages GameMate links to, so a page
  // can't open arbitrary programs or sites.
  handle('app:open-source', (_event, url: unknown) => {
    if (typeof url === 'string' && allowedLink(url)) shell.openExternal(url)
  })

  handle('updates:state', () => updateState())
  handle('updates:check', () => checkForUpdates())
  handle('updates:install', () => installUpdate())
  // "Delete my data": everything GameMate stored on this PC, back to a fresh install.
  handle('app:open-logs', () => shell.openPath(logFolder()))
  handle('app:delete-data', async () => {
    deleteLogs()
    clearGeminiKey()
    clearEvents()
    clearSession()
    await stopEngine()
    await Promise.all([
      ...speechModelStatuses().map((m) => removeSpeechModel(m.id)),
      removeAllLocalModels()
    ])
    resetSettings()
  })

  handle('capture:list-sources', (event) => listSources(senderWindow(event)))

  handle('capture:screenshot', (event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || !/^(screen|window):[\w:-]+$/.test(sourceId)) {
      throw new Error('Invalid capture source.')
    }
    return captureSource(sourceId, senderWindow(event))
  })

  handle('settings:get', () => getSettings())
  handle('settings:update', (_event, patch: unknown) => updateSettings(patch))
  handle('app:info', () => appInfo())
  // Only reads Windows' language list, so it works before the Terms are accepted.
  handle('app:system-language', () => systemLanguage())

  handle('overlay:hide', () => hideOverlay())
  handle('overlay:set-height', (_event, height: unknown) => setOverlayHeight(height))
  handle('overlay:take-screenshot', () => takePendingScreenshot())
  // The player started typing (or speaking) a question: load the AI model while they finish.
  handle('overlay:warm-up', () => warmUp())

  handle('toast:hide', () => hideToast())
  handle('toast:set-height', (_event, height: unknown) => setToastHeight(height))
  handle('toast:ready', () => toastReady())
  handle('toast:done-speaking', () => toastDoneSpeaking())

  handle('session:get', () => getSession())
  handle('session:update', (_event, patch: unknown) => updateSession(patch))

  handle('companion:get-state', () => getObserverState())
  handle('companion:set-paused', (_event, paused: unknown) => {
    if (typeof paused === 'boolean') setPaused(paused)
  })
  handle('companion:clear-events', () => clearEvents())
}
