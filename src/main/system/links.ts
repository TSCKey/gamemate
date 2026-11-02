// Web pages GameMate may open in the player's browser: its games' wikis, Modrinth and the
// policy pages the settings link to. Anything else (other sites, programs, files) is refused.
import { allGames } from '../games/current'
import type { WikiSite } from '../../shared/types'

// Policy and setup pages the settings screen links to.
const EXTERNAL_LINKS = [
  'https://aistudio.google.com/apikey',
  'https://ai.google.dev/gemini-api/terms',
  'https://policies.google.com/privacy',
  'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer',
  // In the Terms of Use and Privacy Policy.
  'mailto:TSCKey1@outlook.com',
  'https://www.edpb.europa.eu/about-edpb/about-edpb/members_en',
  'https://sdaia.gov.sa'
]

// Wikis of other games the player asked about (found by name while answering).
const otherWikis = new Set<string>()

export function allowWiki(site: WikiSite): void {
  otherWikis.add(new URL(site.articlePath.replace('$1', '')).origin)
}

// Pages from web search: Google's links to the results, and its Search Suggestions.
const SEARCH_LINKS = [
  'https://vertexaisearch.cloud.google.com/grounding-api-redirect/',
  'https://www.google.com/search?'
]

export function allowedLink(url: string): boolean {
  if (EXTERNAL_LINKS.includes(url)) return true
  if (SEARCH_LINKS.some((prefix) => url.startsWith(prefix))) return true
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
