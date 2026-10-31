// Looks things up on minecraft.wiki (the community Minecraft Wiki) for questions the bundled
// recipe data can't answer, such as how to build a Nether portal. Only the search words are sent.
// Wiki text is CC BY-NC-SA 3.0, so every answer that uses it links back to the page.

const API = 'https://minecraft.wiki/api.php'
const USER_AGENT = 'GameMate/1.0 (https://github.com/TSCKey/gamemate)'
const TIMEOUT_MS = 8_000
const MAX_CHARS = 4_000
const CACHE_MS = 30 * 60_000
// Sections that rarely help a player mid-game.
const SKIP_SECTIONS =
  /^(history|gallery|trivia|references|videos|sounds|data values|achievements|advancements|issues|external links|development|see also|navigation)/i

export interface WikiSource {
  title: string
  url: string
}

export interface WikiLookup {
  text: string
  source: WikiSource | null
}

const cache = new Map<string, { at: number; result: WikiLookup }>()

async function api<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`minecraft.wiki returned ${res.status}`)
  return (await res.json()) as T
}

// Keeps the intro and useful sections, in order, up to MAX_CHARS.
function trimExtract(extract: string): string {
  const parts = extract.split(/\n(?===+ [^=]+ ==+)/)
  const kept: string[] = []
  let length = 0
  let skipping = false
  for (const part of parts) {
    const heading = /^(=+) ([^=]+?) =+/.exec(part)
    if (heading) {
      // A top-level section decides whether its subsections are kept too.
      if (heading[1].length === 2) skipping = SKIP_SECTIONS.test(heading[2].trim())
      if (skipping) continue
    }
    const clean = part.replace(/\n{3,}/g, '\n\n').trim()
    if (!clean) continue
    if (length + clean.length > MAX_CHARS) {
      kept.push(clean.slice(0, MAX_CHARS - length) + '…')
      break
    }
    kept.push(clean)
    length += clean.length
  }
  return kept.join('\n\n')
}

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? []

// Search ranks by page text, so "sharpness enchantment" can rank "Copper Sword" first.
// Prefer the result whose title shares the most words with the query; keep search order on ties.
function bestTitle(query: string, titles: string[]): string | undefined {
  const q = new Set(words(query).map((w) => w.replace(/s$/, '')))
  let best: string | undefined
  let bestScore = -1
  for (const title of titles) {
    const t = words(title).map((w) => w.replace(/s$/, ''))
    const score = t.filter((w) => q.has(w)).length / Math.max(1, t.length)
    if (score > bestScore) {
      best = title
      bestScore = score
    }
  }
  return best
}

export async function lookupWiki(query: string): Promise<WikiLookup> {
  const q = query.trim().slice(0, 200)
  if (!q) return { text: 'No search words given.', source: null }
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result

  const search = await api<{ query?: { search?: { title: string }[] } }>({
    action: 'query',
    list: 'search',
    srsearch: q,
    srnamespace: '0',
    srlimit: '5'
  })
  const title = bestTitle(q, search.query?.search?.map((r) => r.title) ?? [])
  if (!title) return { text: `minecraft.wiki has no page about "${q}".`, source: null }

  const page = await api<{ query?: { pages?: { title: string; extract?: string }[] } }>({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    titles: title
  })
  const found = page.query?.pages?.[0]
  const extract = found?.extract ? trimExtract(found.extract) : ''
  const source = {
    title: found?.title ?? title,
    url: `https://minecraft.wiki/w/${encodeURIComponent((found?.title ?? title).replace(/ /g, '_'))}`
  }
  const result: WikiLookup = {
    text: extract
      ? `From the minecraft.wiki page "${source.title}":\n\n${extract}`
      : `The minecraft.wiki page "${source.title}" has no readable text.`,
    source: extract ? source : null
  }
  cache.set(key, { at: Date.now(), result })
  return result
}
