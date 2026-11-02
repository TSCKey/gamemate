// Web pages GameMate may open in the player's browser: its games' wikis, Modrinth and the
// policy pages the settings link to. Anything else (other sites, programs, files) is refused.
import { allGames } from '../games/current'
import type { WikiSite } from '../../shared/types'

// Policy and setup pages the settings screen links to.
const EXTERNAL_LINKS = [
  'https://aistudio.google.com/apikey',
  'https://ai.google.dev/gemini-api/terms',
  'https://policies.google.com/privacy',
  'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer'
]

// Wikis of other games the player asked about (found by name while answering).
const otherWikis = new Set<string>()

export function allowWiki(site: WikiSite): void {
  otherWikis.add(new URL(site.articlePath.replace('$1', '')).origin)
}

export function allowedLink(url: string): boolean {
  if (EXTERNAL_LINKS.includes(url)) return true
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }
  const origins = new Set(['https://modrinth.com', ...otherWikis])
  for (const game of allGames()) {
    if (game.wiki) origins.add(new URL(game.wiki.articlePath.replace('$1', '')).origin)
  }
  return target.protocol === 'https:' && origins.has(target.origin)
}
