// User settings shared by the main window and the floating window, saved to userData.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface Settings {
  // Ollama model used for answers ('' until the user or GameMate picks one).
  model: string
  minecraftVersion: string
  // Whether the floating window sends a screenshot of the screen with each question.
  overlayScreenshot: boolean
}

const DEFAULTS: Settings = { model: '', minecraftVersion: '26.1', overlayScreenshot: true }

const file = (): string => join(app.getPath('userData'), 'settings.json')
let current: Settings | null = null

export function getSettings(): Settings {
  if (!current) {
    try {
      current = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>) }
    } catch {
      current = { ...DEFAULTS }
    }
  }
  return current
}

// Renderer input is untrusted: only accept known keys with the right types.
export function updateSettings(patch: unknown, validVersions: string[]): Settings {
  if (typeof patch !== 'object' || patch === null) throw new Error('Invalid settings.')
  const p = patch as Record<string, unknown>
  const next = { ...getSettings() }
  if (typeof p.model === 'string') next.model = p.model.slice(0, 200)
  if (typeof p.minecraftVersion === 'string' && validVersions.includes(p.minecraftVersion)) {
    next.minecraftVersion = p.minecraftVersion
  }
  if (typeof p.overlayScreenshot === 'boolean') next.overlayScreenshot = p.overlayScreenshot

  current = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (error) {
    console.error('Could not save settings', error)
  }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', next)
  return next
}
