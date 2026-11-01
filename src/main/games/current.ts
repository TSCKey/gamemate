// The game GameMate is helping with right now: followed automatically when the player is in a
// game, or picked by the player. For Minecraft this also works out the modpack in use.
import { basename } from 'path'
import { foregroundHandle, windowProgram, type WindowProgram } from '../foreground'
import { getSettings, updateSettings } from '../settings'
import type { WikiSite } from '../wiki'
import { GAMES, customGameProfile, type GameProfile } from './catalog'
import { listVersions } from './minecraft'
import { gameDirOfProcess, readModpack, type Modpack } from './modpacks'

const MODPACK_CACHE_MS = 60_000

export function allGames(): GameProfile[] {
  return [...getSettings().customGames.map(customGameProfile), ...GAMES]
}

export function gameById(id: string): GameProfile {
  return allGames().find((g) => g.id === id) ?? GAMES[0]
}

export function currentGame(): GameProfile {
  return gameById(getSettings().currentGame)
}

// Which known game a program is, by its file name (and title or folder for Java games).
export function matchGame(
  program: { exe: string; title: string },
  games: GameProfile[]
): GameProfile | null {
  const exe = basename(program.exe).toLowerCase()
  for (const game of games) {
    if (!game.exes.some((e) => (typeof e === 'string' ? e === exe : e.test(exe)))) continue
    if (!game.title && !game.pathHint) return game
    if (game.title?.test(program.title) || game.pathHint?.test(program.exe)) return game
  }
  return null
}

// The Minecraft process seen most recently, to find its modpack.
let minecraftPid: number | null = null

// The game in the window in front, if it is one.
export function foregroundGame(): { game: GameProfile; program: WindowProgram } | null {
  const handle = foregroundHandle()
  const program = handle && windowProgram(handle)
  if (!program) return null
  // GAMEMATE_GAME_WINDOW lets developers treat another window as a game for testing.
  const test = process.env.GAMEMATE_GAME_WINDOW
  const game =
    test && new RegExp(test).test(program.title)
      ? gameById(process.env.GAMEMATE_GAME_ID ?? 'minecraft')
      : matchGame(program, allGames())
  if (!game) return null
  if (game.id === 'minecraft') minecraftPid = program.pid
  return { game, program }
}

// When the player is in a game (shortcut pressed, companion watching), make it the current one.
export function followForegroundGame(): { game: GameProfile; program: WindowProgram } | null {
  const found = foregroundGame()
  const settings = getSettings()
  if (found && settings.autoDetectGame && settings.currentGame !== found.game.id) {
    updateSettings({ currentGame: found.game.id }, listVersions())
  }
  return found
}

const packs = new Map<string, { at: number; pack: Modpack | null }>()
let running: { pid: number; dir: string | null } | null = null

async function cachedModpack(dir: string): Promise<Modpack | null> {
  const hit = packs.get(dir)
  if (hit && Date.now() - hit.at < MODPACK_CACHE_MS) return hit.pack
  const pack = await readModpack(dir)
  packs.set(dir, { at: Date.now(), pack })
  return pack
}

// The modpack in use: the player's choice, or the one the running Minecraft was started from.
export async function currentModpack(): Promise<Modpack | null> {
  const choice = getSettings().minecraftModpack
  if (choice === '') return null
  if (choice !== 'auto') return cachedModpack(choice)
  if (minecraftPid && running?.pid !== minecraftPid) {
    running = { pid: minecraftPid, dir: await gameDirOfProcess(minecraftPid) }
  }
  return running?.dir ? cachedModpack(running.dir) : null
}

// GameMate's recipe data closest to a pack's Minecraft version ("1.20.1" -> "1.20.4"), or null.
function recipeVersionFor(minecraftVersion: string): string | null {
  const versions = listVersions()
  if (versions.includes(minecraftVersion)) return minecraftVersion
  const [major, minor] = minecraftVersion.split('.')
  return versions.find((v) => v.split('.').slice(0, 2).join('.') === `${major}.${minor}`) ?? null
}

export interface GameContext {
  name: string
  wiki?: WikiSite
  minecraft?: {
    // Version of GameMate's recipe data to use (null: none close enough).
    recipeVersion: string | null
    // Shown to the model, e.g. "Java Edition 26.1".
    edition: string
    modpack: Modpack | null
  }
}

export async function gameContext(): Promise<GameContext> {
  const game = currentGame()
  if (game.id !== 'minecraft') return { name: game.name, wiki: game.wiki }
  const modpack = await currentModpack()
  const version = modpack?.minecraftVersion || getSettings().minecraftVersion
  return {
    name: game.name,
    wiki: game.wiki,
    minecraft: {
      recipeVersion: modpack ? recipeVersionFor(version) : version,
      edition: `Java Edition ${version}`,
      modpack
    }
  }
}
