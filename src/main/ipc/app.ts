// Settings, updates, screenshots, GameMate's small windows, the companion and the player's data.
import { BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron'
import type { AppInfo } from '../../shared/types'
import { captureSource, listSources } from '../capture'
import { stopEngine } from '../llamaEngine'
import { removeAllLocalModels } from '../localModels'
import { allowedLink } from '../links'
import { deleteLogs, logFolder } from '../log'
import { clearEvents, getObserverState, setPaused } from '../observer'
import { hideOverlay, setOverlayHeight, takePendingScreenshot } from '../overlay'
import { clearGeminiKey } from '../secrets'
import { handle } from '../security'
import { getSettings, resetSettings, updateSettings } from '../settings'
import { hideToast, setToastHeight } from '../toast'
import { checkForUpdates, installUpdate, updateState } from '../updater'
import { removeSpeechModel, speechModelStatuses } from '../voiceModels'

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('No window for this request.')
  return win
}

export function registerAppHandlers(appInfo: () => AppInfo): void {
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

  handle('overlay:hide', () => hideOverlay())
  handle('overlay:set-height', (_event, height: unknown) => setOverlayHeight(height))
  handle('overlay:take-screenshot', () => takePendingScreenshot())

  handle('toast:hide', () => hideToast())
  handle('toast:set-height', (_event, height: unknown) => setToastHeight(height))

  handle('companion:get-state', () => getObserverState())
  handle('companion:set-paused', (_event, paused: unknown) => {
    if (typeof paused === 'boolean') setPaused(paused)
  })
  handle('companion:clear-events', () => clearEvents())
}
