// Web pages GameMate may open in the player's browser: its games' wikis, Modrinth and the
// policy pages the settings link to. Anything else (other sites, programs, files) is refused.
import { allGames } from '../games/current'

// Policy and setup pages the settings screen links to.
const EXTERNAL_LINKS = [
  'https://aistudio.google.com/apikey',
  'https://ai.google.dev/gemini-api/terms',
  'https://policies.google.com/privacy',
  'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer'
]

export function allowedLink(url: string): boolean {
  if (EXTERNAL_LINKS.includes(url)) return true
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }
  const origins = new Set(['https://modrinth.com'])
  for (const game of allGames()) {
    if (game.wiki) origins.add(new URL(game.wiki.articlePath.replace('$1', '')).origin)
  }
  return target.protocol === 'https:' && origins.has(target.origin)
}
