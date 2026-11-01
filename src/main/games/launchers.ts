// Finds games installed through Steam, Epic Games, Battle.net and Riot, from the launchers' own
// records on this PC. Only runs when the player clicks "Scan for games" (after agreeing to it).
// Kept free of Electron so it can be tested on its own.
import { execFile } from 'child_process'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'

export type Launcher = 'steam' | 'epic' | 'battlenet' | 'riot'

export interface InstalledGame {
  // Stable per launcher, e.g. "steam-2767030".
  id: string
  name: string
  launcher: Launcher
  // The game's folder: any program running from inside it is this game.
  installDir: string
}

const run = promisify(execFile)

// Launcher tools, runtimes and other things that show up in libraries but aren't games.
const NOT_GAMES =
  /redistributable|steamworks|proton|steamvr|steam linux runtime|soundtrack|dedicated server|\bsdk\b|benchmark|unreal engine|bridge|plugin|^battle\.net$|riot client|vanguard|wallpaper engine/i

function clean(name: string): string {
  return name.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
}

// Steam's text format: pull "key" "value" pairs out of a .vdf/.acf file.
function vdfValues(text: string, key: string): string[] {
  const re = new RegExp(`"${key}"\\s+"((?:[^"\\\\]|\\\\.)*)"`, 'gi')
  return [...text.matchAll(re)].map((m) => m[1].replace(/\\\\/g, '\\'))
}

async function steamRoot(): Promise<string> {
  try {
    const { stdout } = await run(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      {
        windowsHide: true
      }
    )
    const path = /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)?.[1]?.trim()
    if (path) return path.replace(/\//g, '\\')
  } catch {
    // not installed, or no registry entry
  }
  return 'C:\\Program Files (x86)\\Steam'
}

async function scanSteam(): Promise<InstalledGame[]> {
  const root = await steamRoot()
  const libraries = new Set([root])
  const vdf = await readFile(join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8').catch(() => '')
  for (const path of vdfValues(vdf, 'path')) libraries.add(path)

  const games: InstalledGame[] = []
  for (const library of libraries) {
    const apps = join(library, 'steamapps')
    const files = await readdir(apps).catch(() => [] as string[])
    for (const file of files.filter((f) => /^appmanifest_\d+\.acf$/i.test(f))) {
      const acf = await readFile(join(apps, file), 'utf8').catch(() => '')
      const [appid] = vdfValues(acf, 'appid')
      const [name] = vdfValues(acf, 'name')
      const [dir] = vdfValues(acf, 'installdir')
      if (!appid || !name || !dir) continue
      games.push({
        id: `steam-${appid}`,
        name: clean(name),
        launcher: 'steam',
        installDir: join(apps, 'common', dir)
      })
    }
  }
  return games
}

async function scanEpic(): Promise<InstalledGame[]> {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
  const files = await readdir(dir).catch(() => [] as string[])
  const games: InstalledGame[] = []
  for (const file of files.filter((f) => f.endsWith('.item'))) {
    try {
      const item = JSON.parse(await readFile(join(dir, file), 'utf8')) as {
        DisplayName?: string
        InstallLocation?: string
        AppName?: string
        AppCategories?: string[]
        bIsIncompleteInstall?: boolean
      }
      if (!item.DisplayName || !item.InstallLocation || !item.AppName) continue
      if (item.bIsIncompleteInstall || !item.AppCategories?.includes('games')) continue
      games.push({
        id: `epic-${item.AppName}`,
        name: clean(item.DisplayName),
        launcher: 'epic',
        installDir: item.InstallLocation
      })
    } catch {
      // unreadable manifest
    }
  }
  return games
}

// Battle.net and Riot games are listed in Windows' installed programs.
async function scanInstalledPrograms(): Promise<InstalledGame[]> {
  const script = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$keys = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
@(Get-ItemProperty $keys -ErrorAction SilentlyContinue |
  Where-Object { $_.Publisher -match 'Blizzard|Riot Games' -and $_.InstallLocation } |
  ForEach-Object { [pscustomobject]@{ key = $_.PSChildName; name = $_.DisplayName; publisher = $_.Publisher; dir = $_.InstallLocation } }) |
  ConvertTo-Json -Compress`
  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 15000
      }
    )
    const parsed = JSON.parse(stdout.trim() || '[]') as
      | { key: string; name: string; publisher: string; dir: string }
      | { key: string; name: string; publisher: string; dir: string }[]
    const entries = Array.isArray(parsed) ? parsed : [parsed]
    return entries.flatMap((e) => {
      const name = clean(e.name ?? '')
      if (!name) return []
      const launcher: Launcher = /riot/i.test(e.publisher) ? 'riot' : 'battlenet'
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      return [{ id: `${launcher}-${slug}`, name, launcher, installDir: e.dir.replace(/\//g, '\\') }]
    })
  } catch {
    return []
  }
}

// Every game found, without launcher tools and without duplicates.
export async function scanLaunchers(): Promise<InstalledGame[]> {
  if (process.platform !== 'win32') return []
  const found = (await Promise.all([scanSteam(), scanEpic(), scanInstalledPrograms()])).flat()
  const seen = new Set<string>()
  return found
    .filter((g) => !NOT_GAMES.test(g.name))
    .filter((g) => {
      const key = g.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
