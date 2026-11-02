// Games, their wikis and Minecraft modpacks.
import { runningApps } from '../games/apps'
import type { GamesState, SavedGame } from '../../shared/types'
import { allGames, currentModpack } from '../games/current'
import { scanLaunchers } from '../games/launchers'
import { listCurseForgeModpacks, type ModpackSummary } from '../games/modpacks'
import { handle } from '../system/security'
import { getSettings, setGames, updateSettings } from '../system/settings'
import { discoverWiki, findWikiForGame } from '../games/wiki'

// What the game menus and settings need to know about each game.
function gamesState(): GamesState {
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
async function scanGames(): Promise<GamesState> {
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

export function registerGameHandlers(): void {
  handle('games:state', () => gamesState())
  handle('games:scan', () => scanGames())
  handle('games:running-apps', () => {
    requireConsent()
    return runningApps()
  })
  handle('games:add', (_event, exe: unknown, name: unknown) => {
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
  handle('games:remove', (_event, id: unknown) => {
    setGames(getSettings().games.filter((g) => g.id !== id))
    return gamesState()
  })
  handle('games:set-wiki', async (_event, id: unknown, address: unknown) => {
    const { games } = getSettings()
    const game = games.find((g) => g.id === id)
    if (!game || typeof address !== 'string') throw new Error('Unknown game.')
    const wiki = address.trim() ? await discoverWiki(address) : undefined
    setGames(games.map((g) => (g.id === game.id ? { ...g, wiki } : g)))
    return gamesState()
  })
  handle('modpacks:list', () => (getSettings().deviceConsent ? cachedModpackList() : []))
  handle('modpacks:current', async (): Promise<ModpackSummary | null> => {
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
}
