import { categoryMembers } from '../games/wiki'
import type { WikiSite } from '../../shared/types'
import { getSettings } from '../system/settings'

export interface SilksongNames {
  bosses: string[]
  areas: string[]
}

// Taken from the Hollow Knight Silksong wiki (hollowknightsilksong.fandom.com) on 2026-11-17.
// Page titles are copied as the wiki writes them, except that a trailing disambiguation such as
// "(Silksong)" is dropped, because the screen shows the plain name. Its other categories
// (Biomes, Points of Interest, Exploration) and the sub-categories of the two below hold no
// further bosses or areas, so nothing more was added.

// From "Category:Bosses (Silksong)" (42 pages).
const BOSSES = [
  'Bell Beast',
  'Bell Eater',
  'Broodmother',
  'Clover Dancers',
  'Cogwork Dancers',
  'Craggler',
  'Crawfather',
  'Crust King Khann',
  'Disgraced Chef Lugoli',
  'Father of the Flame',
  'First Sinner',
  'Forebrothers Signis and Gron',
  'Fourth Chorus',
  'Grand Mother Silk',
  'Great Conchflies',
  'Groal the Great',
  'Gurr the Outcast',
  'Karmelita',
  'Lace',
  'Last Judge',
  'Lost Garmond',
  'Lost Lace',
  'Moorwing',
  'Moss Mother',
  'Nyleth',
  'Phantom',
  'Pinstress',
  'Plasmified Zango',
  'Raging Conchfly',
  'Savage Beastfly',
  'Second Sentinel',
  'Seth',
  'Sharpe',
  'Sister Splinter',
  'Skarrgard',
  'Skull Tyrant',
  'The Unraveled',
  'Tormented Trobbio',
  'Trobbio',
  'Voltvyrm',
  'Watcher at the Edge',
  'Widow'
]

// From "Category:Areas (Silksong)" (15 pages, no sub-categories).
const AREAS = [
  'Bilewater',
  'Blasted Steps',
  'Bone Bottom',
  'Citadel',
  // Not a wiki page: the name the game's own act card shows (owner's recording, 2026-11-17).
  'Citadel of Song',
  'Deep Docks',
  'Far Fields',
  'Greymoor',
  "Hunter's March",
  'Marrow',
  'Moss Grotto',
  'Shellwood',
  "Sinner's Road",
  'The Abyss',
  'The Mists',
  'Weavenest Atla'
]

export const SILKSONG_FALLBACK: SilksongNames = { bosses: BOSSES, areas: AREAS }

// "The Abyss (Silksong)" and "Lace (boss)" are shown on screen as plain "The Abyss" and "Lace".
const plain = (title: string): string => title.replace(/\s*\([^)]*\)\s*$/, '')

const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b].map(plain))]

// A category's pages plus those of its sub-categories, one level deep.
async function withSubcategories(wiki: WikiSite, category: string): Promise<string[]> {
  const [pages, subs] = await Promise.all([
    categoryMembers(wiki, category),
    categoryMembers(wiki, category, 500, 'subcat')
  ])
  const deeper = await Promise.all(
    subs.map((sub) => categoryMembers(wiki, sub.replace(/^Category:/, '')))
  )
  return [...pages, ...deeper.flat()]
}

let cached: SilksongNames | null = null

// The wiki's boss and area names when online lookups are on, otherwise (or when the wiki
// cannot be reached) the built-in lists. A partial wiki answer never drops a known name.
export async function silksongNames(): Promise<SilksongNames> {
  if (cached) return cached
  const settings = getSettings()
  const wiki = settings.games.find((g) => /silksong/i.test(g.name))?.wiki
  if (!settings.webLookup || !wiki) return SILKSONG_FALLBACK
  try {
    const [bosses, areas] = await Promise.all([
      categoryMembers(wiki, 'Bosses (Silksong)'),
      withSubcategories(wiki, 'Areas (Silksong)')
    ])
    cached = {
      bosses: union(SILKSONG_FALLBACK.bosses, bosses),
      areas: union(SILKSONG_FALLBACK.areas, areas)
    }
    return cached
  } catch {
    return SILKSONG_FALLBACK
  }
}
