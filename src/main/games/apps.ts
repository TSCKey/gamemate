// Programs with an open window, so the player can pick their game when adding it to GameMate.
import { desktopCapturer } from 'electron'
import { basename } from 'path'
import { handleFromSourceId, windowProgram } from '../system/foreground'
import type { RunningApp } from '../../shared/types'
export type { RunningApp }

// Parts of Windows itself, which are never games.
const NOT_GAMES = new Set([
  'explorer.exe',
  'applicationframehost.exe',
  'textinputhost.exe',
  'searchhost.exe',
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'systemsettings.exe',
  'lockapp.exe'
])

export async function runningApps(): Promise<RunningApp[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 }
  })
  const apps = new Map<string, RunningApp>()
  for (const source of sources) {
    const handle = handleFromSourceId(source.id)
    const program = handle ? windowProgram(handle) : null
    // GameMate's own windows belong to this process.
    if (!program || program.pid === process.pid) continue
    const exe = basename(program.exe)
    const key = exe.toLowerCase()
    if (NOT_GAMES.has(key) || apps.has(key)) continue
    apps.set(key, { exe, title: program.title || source.name })
  }
  return [...apps.values()].sort((a, b) => a.title.localeCompare(b.title))
}
