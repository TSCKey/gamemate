import { categoryMembers } from '../games/wiki'
import { getSettings } from '../system/settings'

export interface SilksongNames {
  bosses: string[]
  areas: string[]
}

// Taken from the Hollow Knight Silksong wiki (hollowknightsilksong.fandom.com) on 2026-11-17.
// Page titles are copied as the wiki writes them.

// From "Category:Bosses (Silksong)".
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

// From "Category:Areas (Silksong)".
const AREAS = [
  'Bilewater',
  'Blasted Steps',
  'Bone Bottom',
  'Citadel',
  'Deep Docks',
  'Far Fields',
  'Greymoor',
  "Hunter's March",
  'Marrow',
  'Moss Grotto',
  'Shellwood',
  "Sinner's Road",
  'The Abyss (Silksong)',
  'The Mists',
  'Weavenest Atla'
]

export const SILKSONG_FALLBACK: SilksongNames = { bosses: BOSSES, areas: AREAS }

const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])]

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
      categoryMembers(wiki, 'Areas (Silksong)')
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
