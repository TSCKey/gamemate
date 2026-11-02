// The games GameMate helps with: Minecraft (built in, with its recipes, wiki and modpacks) and the
// games the player's scan found or the player added. Nothing about other games is built in except
// a few hints for well-known competitive games.
import type { WikiSite } from './wiki'
import type { SavedGame } from '../../shared/types'
export type { SavedGame }

export interface GameProfile {
  id: string
  name: string
  // Lower-case program names of the running game (added games, and Minecraft).
  exes: (string | RegExp)[]
  // Games found by a scan: any program running from inside this folder is the game.
  installDir?: string
  // For games that run as a generic program (Minecraft runs on Java): the window title or the
  // program's folder must also match one of these.
  title?: RegExp
  pathHint?: RegExp
  wiki?: WikiSite
  // Ranked online games, where AI help during matches may break the game's rules.
  competitive?: boolean
  // What matters on screen in this game, for the companion.
  watchFor: string
  // Example questions for an empty chat.
  examples: [string, string]
}

export const MINECRAFT: GameProfile = {
  id: 'minecraft',
  name: 'Minecraft',
  // Java Edition runs on Java; Bedrock is Minecraft.Windows.exe.
  exes: ['javaw.exe', 'java.exe', 'minecraft.windows.exe'],
  title: /^minecraft(\*?\s+\d|$)/i,
  // Modpacks often change the window title; their Java comes from the launcher's folder.
  pathHint: /minecraft|curseforge|modrinth|prismlauncher|multimc|atlauncher|gdlauncher/i,
  wiki: {
    name: 'Minecraft Wiki',
    api: 'https://minecraft.wiki/api.php',
    articlePath: 'https://minecraft.wiki/w/$1',
    license: 'CC BY-NC-SA 3.0'
  },
  watchFor:
    'the "You Died!" screen, the health bar dropping to 3 hearts or fewer, creepers, zombies, skeletons or spiders close by, dark caves where mobs can spawn, villages, structures and diamonds',
  examples: ['How do I craft a piston?', 'How do I build a Nether portal?']
}

const GENERIC_WATCH = 'danger, enemies or bosses close by, low health, death and notable finds'
const GENERIC_EXAMPLES: [string, string] = ['What should I do next?', 'Any tips for where I am?']

// What to watch for in well-known competitive games, matched by name.
const HINTS: { name: RegExp; watchFor: string; examples: [string, string] }[] = [
  {
    name: /^valorant$/i,
    watchFor: 'the spike being planted or defused, low health, the round being won or lost',
    examples: ['Which agent is good for beginners?', 'How does Jett’s dash work?']
  },
  {
    name: /^overwatch/i,
    watchFor: 'low health, the ultimate being ready, the objective being contested, team fights',
    examples: ['How do I counter Widowmaker?', 'Which tank is easiest to learn?']
  },
  {
    name: /^marvel rivals$/i,
    watchFor: 'low health, the ultimate being ready, the payload or objective status',
    examples: ['Which hero is good for beginners?', 'How do team-up abilities work?']
  },
  {
    name: /^counter-strike/i,
    watchFor: 'the bomb being planted, low health, the round being won or lost',
    examples: ['How do I spray control the AK-47?', 'When should I save money?']
  },
  {
    name: /^league of legends$/i,
    watchFor: 'low health, dragon or Baron being taken, towers falling',
    examples: ['Which champion is good for beginners?', 'How do I farm better?']
  },
  {
    name: /^apex legends$/i,
    watchFor: 'the ring closing, low health or shields, enemies close by',
    examples: ['Which legend is good for beginners?', 'Where should I land?']
  },
  {
    name: /^fortnite$/i,
    watchFor: 'the storm closing, low health or shields, enemies close by',
    examples: ['How do I build faster?', 'Where should I land?']
  },
  {
    name: /^(rainbow six|tom clancy's rainbow six)/i,
    watchFor: 'low health, the defuser or objective, the round being won or lost',
    examples: ['Which operator is good for beginners?', 'How do I use drones well?']
  },
  {
    name: /^rocket league$/i,
    watchFor: 'goals scored or conceded, low boost, overtime',
    examples: ['How do I aerial?', 'How do I rotate properly?']
  },
  {
    name: /^(dota 2|2xko|brawlhalla)$/i,
    watchFor: 'low health, the round or match being won or lost',
    examples: ['Who is good for beginners?', 'How do I get better at this?']
  }
]

// What the rest of GameMate knows about a found or added game.
export function savedGameProfile(game: SavedGame): GameProfile {
  const hint = HINTS.find((h) => h.name.test(game.name))
  return {
    id: game.id,
    name: game.name,
    exes: game.exe ? [game.exe.toLowerCase()] : [],
    installDir: game.installDir,
    wiki: game.wiki,
    competitive: Boolean(hint),
    watchFor: hint?.watchFor ?? GENERIC_WATCH,
    examples: hint?.examples ?? GENERIC_EXAMPLES
  }
}
