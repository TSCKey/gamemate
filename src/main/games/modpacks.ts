// Minecraft modpacks: finds the packs installed with CurseForge (read from its instance files on
// this PC), works out which pack is running from the game's folder, and looks up what a mod does
// on Modrinth. Kept free of Electron so it can be tested on its own.
import { execFile } from 'child_process'
import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname, join } from 'path'
import { promisify } from 'util'
import type { WikiLookup } from '../wiki'
import type { ModpackSummary } from '../../shared/types'
export type { ModpackSummary }

export interface Mod {
  name: string
  url?: string
}

export interface Modpack {
  name: string
  // The pack's folder.
  path: string
  // e.g. "26.1.2" ('' if unknown).
  minecraftVersion: string
  // e.g. "NeoForge 26.1.2.109" ('' if unknown).
  loader: string
  mods: Mod[]
}

interface CurseForgeInstance {
  name?: string
  gameVersion?: string
  lastPlayed?: string
  baseModLoader?: { name?: string } | null
  installedAddons?: { name?: string; webSiteURL?: string; isEnabled?: boolean }[]
}

const CURSEFORGE_DIRS = [
  join(homedir(), 'curseforge', 'minecraft', 'Instances'),
  join(homedir(), 'Documents', 'Curse', 'Minecraft', 'Instances')
]
const MODRINTH = 'https://api.modrinth.com/v2'
const USER_AGENT = 'TSCKey/gamemate/1.0 (https://github.com/TSCKey/gamemate)'
const MAX_DESCRIPTION = 3_000

// "neoforge-26.1.2.109" -> "NeoForge 26.1.2.109"
function loaderName(raw: string | undefined): string {
  if (!raw) return ''
  const [kind, ...version] = raw.split('-')
  const names: Record<string, string> = {
    forge: 'Forge',
    neoforge: 'NeoForge',
    fabric: 'Fabric',
    quilt: 'Quilt'
  }
  // Fabric and Quilt repeat the Minecraft version at the end ("0.20.1-1.20.1").
  const number = version.join('-').replace(/-\d+\.\d+(\.\d+)?$/, '')
  return `${names[kind.toLowerCase()] ?? kind} ${number}`.trim()
}

async function readInstance(dir: string): Promise<CurseForgeInstance | null> {
  try {
    // CurseForge writes the file with a byte-order mark.
    const text = await readFile(join(dir, 'minecraftinstance.json'), 'utf8')
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as CurseForgeInstance
  } catch {
    return null
  }
}

// "create-1.20.1-0.5.1.f.jar" -> "create", "Mekanism-1.20.1-10.4.5.jar" -> "Mekanism"
function modNameFromFile(file: string): string {
  const stem = file.replace(/\.jar$/i, '')
  const cut = stem.search(/[-_ +](v?\d|mc\d|forge|neoforge|fabric|quilt)/i)
  return (cut > 0 ? stem.slice(0, cut) : stem).replace(/[-_]+/g, ' ').trim()
}

// Installed CurseForge packs, most recently played first.
export async function listCurseForgeModpacks(): Promise<ModpackSummary[]> {
  const found: (ModpackSummary & { lastPlayed: string })[] = []
  for (const root of CURSEFORGE_DIRS) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const path = join(root, entry.name)
      const instance = await readInstance(path)
      if (!instance) continue
      found.push({
        name: instance.name || entry.name,
        path,
        minecraftVersion: instance.gameVersion ?? '',
        loader: loaderName(instance.baseModLoader?.name),
        modCount: instance.installedAddons?.length ?? 0,
        lastPlayed: instance.lastPlayed ?? ''
      })
    }
  }
  return found
    .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed) || a.name.localeCompare(b.name))
    .map((p) => ({
      name: p.name,
      path: p.path,
      minecraftVersion: p.minecraftVersion,
      loader: p.loader,
      modCount: p.modCount
    }))
}

// A pack's details from its folder: CurseForge's instance file, or else the jars in mods/.
// Returns null for a folder without mods (plain Minecraft).
export async function readModpack(path: string): Promise<Modpack | null> {
  const instance = await readInstance(path)
  if (instance) {
    return {
      name: instance.name || basename(path),
      path,
      minecraftVersion: instance.gameVersion ?? '',
      loader: loaderName(instance.baseModLoader?.name),
      mods: (instance.installedAddons ?? [])
        .filter((a) => a.name && a.isEnabled !== false)
        .map((a) => ({ name: a.name as string, url: a.webSiteURL }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  }
  const jars = (await readdir(join(path, 'mods')).catch(() => [] as string[])).filter((f) =>
    f.toLowerCase().endsWith('.jar')
  )
  if (jars.length === 0) return null
  // Other launchers keep the game in a "minecraft" or ".minecraft" folder inside the instance.
  const folder = /^\.?minecraft$/i.test(basename(path)) ? basename(dirname(path)) : basename(path)
  return {
    name: folder,
    path,
    minecraftVersion: '',
    loader: '',
    mods: jars
      .map((f) => ({ name: modNameFromFile(f) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}

// The game folder of a running Minecraft, from its command line ("--gameDir <folder>").
export async function gameDirOfProcess(pid: number): Promise<string | null> {
  if (process.platform !== 'win32' || !Number.isInteger(pid)) return null
  try {
    const { stdout } = await promisify(execFile)(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`
      ],
      { timeout: 8000, windowsHide: true }
    )
    const match = /--gameDir\s+(?:"([^"]+)"|(\S+))/.exec(stdout)
    const dir = match?.[1] ?? match?.[2]
    return dir && (await stat(dir).catch(() => null))?.isDirectory() ? dir : null
  } catch {
    return null
  }
}

// Mods whose name contains every word of the query.
export function searchMods(pack: Modpack, query: string): string {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = pack.mods.filter((m) => words.every((w) => m.name.toLowerCase().includes(w)))
  if (!words.length) return `"${pack.name}" has ${pack.mods.length} mods.`
  return hits.length
    ? `Installed in "${pack.name}": ${hits
        .slice(0, 20)
        .map((m) => m.name)
        .join(', ')}${hits.length > 20 ? ` and ${hits.length - 20} more` : ''}.`
    : `No installed mod in "${pack.name}" matches "${query}".`
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function modrinth<T>(path: string): Promise<T> {
  const res = await fetch(`${MODRINTH}${path}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`Modrinth returned ${res.status}`)
  return (await res.json()) as T
}

// What a mod does, from its Modrinth page. Only the mod's name is sent.
export async function modInfo(name: string): Promise<WikiLookup> {
  const query = name.trim().slice(0, 100)
  if (!query) return { text: 'No mod name given.', source: null }
  const facets = encodeURIComponent('[["project_type:mod"]]')
  const search = await modrinth<{ hits: { project_id: string; title: string }[] }>(
    `/search?query=${encodeURIComponent(query)}&limit=5&facets=${facets}`
  )
  const wanted = query.toLowerCase()
  const hit =
    search.hits.find((h) => h.title.toLowerCase() === wanted) ??
    search.hits.find((h) => h.title.toLowerCase().includes(wanted)) ??
    search.hits[0]
  if (!hit) return { text: `Modrinth has no mod called "${query}".`, source: null }
  const project = await modrinth<{
    slug: string
    title: string
    description: string
    body: string
  }>(`/project/${hit.project_id}`)
  const body = cleanMarkdown(project.body ?? '')
  return {
    text: `From the Modrinth page of the mod "${project.title}": ${project.description}\n\n${
      body.length > MAX_DESCRIPTION ? `${body.slice(0, MAX_DESCRIPTION)}…` : body
    }`,
    source: {
      title: project.title,
      url: `https://modrinth.com/mod/${project.slug}`,
      wiki: 'Modrinth',
      license: 'see the mod page'
    }
  }
}
