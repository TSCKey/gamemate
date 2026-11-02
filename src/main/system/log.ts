// GameMate's log file, kept on this PC only (in the logs folder of GameMate's data) so problems
// can be looked into. It records what GameMate does, never the player's questions or answers.
import { app } from 'electron'
import log from 'electron-log/main'
import { dirname } from 'path'
import { rmSync } from 'fs'

export function startLogging(): void {
  log.transports.file.level = 'info'
  // About 1 MB, plus the previous file.
  log.transports.file.maxSize = 1024 * 1024
  log.transports.console.level = app.isPackaged ? false : 'debug'
  // Everything the main process prints goes to the file too.
  Object.assign(console, log.functions)
  // Electron logs every failed request from a window with a stack trace, even expected ones
  // like "Ollama isn't running" (which the window shows the player); one line is enough.
  log.hooks.push((message) => {
    const [text, error] = message.data
    const handler =
      typeof text === 'string' && /^Error occurred in handler for '([^']+)'/.exec(text)
    if (handler) {
      message.level = 'warn'
      message.data = [`${handler[1]} failed: ${error instanceof Error ? error.message : error}`]
    }
    return message
  })
  log.errorHandler.startCatching({ showDialog: false })
  log.info(`GameMate ${app.getVersion()} starting (Electron ${process.versions.electron})`)
}

export function logFolder(): string {
  return dirname(log.transports.file.getFile().path)
}

// Used by "Delete my data".
export function deleteLogs(): void {
  try {
    rmSync(logFolder(), { recursive: true, force: true })
  } catch (error) {
    log.warn('Could not delete the logs', error)
  }
}

export { log }
