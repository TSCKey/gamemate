// Second line of defense from Electron's security checklist: only GameMate's own pages may call
// into the main process, and no page can navigate a GameMate window or open one elsewhere.
import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { pathToFileURL } from 'url'

const RENDERER_FILE = pathToFileURL(join(__dirname, '../renderer/index.html')).href

// True for the address of GameMate's own interface (any of its windows).
export function isOwnPage(url: string): boolean {
  let page: URL
  try {
    page = new URL(url)
  } catch {
    return false
  }
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devServer) return page.origin === new URL(devServer).origin
  page.hash = ''
  return page.href === RENDERER_FILE
}

// A check run before every request (used to hold some back until the Terms are accepted).
let gate: ((channel: string) => void) | null = null

export function gateChannels(check: (channel: string) => void): void {
  gate = check
}

// ipcMain.handle, refusing calls that don't come from the top frame of a GameMate page.
export function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
): void {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame
    if (!frame || frame.parent || !isOwnPage(frame.url)) {
      throw new Error(`Refused ${channel}: not called from GameMate.`)
    }
    gate?.(channel)
    return listener(event, ...args)
  })
}

// Applies to every window GameMate opens. Links the player may follow (allowedLink) open in
// their browser; everything else is refused.
export function hardenWindows(allowedLink: (url: string) => boolean): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isOwnPage(url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (allowedLink(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}
