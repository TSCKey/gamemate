// Looks things up on a game's wiki (any MediaWiki site: minecraft.wiki, wiki.gg, Fandom, …) for
// questions GameMate's own data can't answer. Only the search words are sent. Wiki text is under
// the wiki's license (usually Creative Commons), so every answer that uses it links to the page.

const USER_AGENT = 'GameMate/1.0 (https://github.com/TSCKey/gamemate)'
const TIMEOUT_MS = 8_000
const MAX_CHARS = 4_000
const CACHE_MS = 30 * 60_000
// Sections that rarely help a player mid-game.
const SKIP_SECTIONS =
  /^(history|gallery|trivia|references|videos|sounds|data values|achievements|advancements|issues|external links|development|see also|navigation|patch history|version history|update history|changelog|bugs|cut content|concept art|transcript|dialogue|official images)/i

export interface WikiSite {
  // e.g. "Terraria Wiki"
  name: string
  // The site's api.php address.
  api: string
  // Page address with $1 in place of the title, e.g. "https://terraria.wiki.gg/wiki/$1".
  articlePath: string
  // License of the wiki's text, shown with every answer that uses it.
  license: string
}

export interface WikiSource {
  title: string
  url: string
  wiki: string
  license: string
}

export interface WikiLookup {
  text: string
  source: WikiSource | null
}

const cache = new Map<string, { at: number; result: WikiLookup }>()

async function api<T>(apiUrl: string, params: Record<string, string>): Promise<T> {
  const url = `${apiUrl}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`the wiki returned ${res.status}`)
  return (await res.json()) as T
}

export const pageUrl = (site: WikiSite, title: string): string =>
  site.articlePath.replace('$1', encodeURIComponent(title.replace(/ /g, '_')))

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

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

// Wikis without plain-text extracts send rendered HTML; turn it into the same "== Section =="
// text format the extracts use.
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<sup\b[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, '')
    .replace(
      /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi,
      (_m, inner: string) => `\n\n== ${stripTags(inner)} ==\n`
    )
    .replace(
      /<h([3-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, _l, inner: string) => `\n\n=== ${stripTags(inner)} ===\n`
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|tr|div|dd|dt|table|ul|ol|caption|figcaption|aside|section)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, code: string) =>
      code[0] === '#'
        ? String.fromCodePoint(
            code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
          )
        : (ENTITIES[code.toLowerCase()] ?? m)
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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

async function findTitle(site: WikiSite, query: string): Promise<string | undefined> {
  const search = await api<{ query?: { search?: { title: string }[] } }>(site.api, {
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: '5'
  }).catch(() => null)
  const found = bestTitle(query, search?.query?.search?.map((r) => r.title) ?? [])
  if (found) return found
  // Some wikis have full-text search turned off; title suggestions still work.
  const suggest = await api<[string, string[]]>(site.api, {
    action: 'opensearch',
    search: query,
    namespace: '0',
    limit: '5'
  }).catch(() => null)
  return bestTitle(query, suggest?.[1] ?? [])
}

async function pageText(site: WikiSite, title: string): Promise<{ title: string; text: string }> {
  const extracts = await api<{ query?: { pages?: { title: string; extract?: string }[] } }>(
    site.api,
    { action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: title }
  ).catch(() => null)
  const page = extracts?.query?.pages?.[0]
  if (page?.extract) return { title: page.title, text: page.extract }
  const parsed = await api<{ parse?: { title: string; text?: string } }>(site.api, {
    action: 'parse',
    page: title,
    prop: 'text',
    redirects: '1',
    disableeditsection: '1',
    disablelimitreport: '1'
  })
  return { title: parsed.parse?.title ?? title, text: htmlToText(parsed.parse?.text ?? '') }
}

export async function lookupWiki(site: WikiSite, query: string): Promise<WikiLookup> {
  const q = query.trim().slice(0, 200)
  if (!q) return { text: 'No search words given.', source: null }
  const key = `${site.api} ${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result

  const title = await findTitle(site, q)
  if (!title) return { text: `The ${site.name} has no page about "${q}".`, source: null }
  const page = await pageText(site, title)
  const text = trimExtract(page.text)
  const source: WikiSource = {
    title: page.title,
    url: pageUrl(site, page.title),
    wiki: site.name,
    license: site.license
  }
  const result: WikiLookup = {
    text: text
      ? `From the ${site.name} page "${source.title}":\n\n${text}`
      : `The ${site.name} page "${source.title}" has no readable text.`,
    source: text ? source : null
  }
  cache.set(key, { at: Date.now(), result })
  return result
}

async function siteAt(api: string): Promise<WikiSite | null> {
  const info = await fetch(
    `${api}?${new URLSearchParams({
      action: 'query',
      meta: 'siteinfo',
      siprop: 'general|rightsinfo',
      format: 'json',
      formatversion: '2'
    })}`,
    { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
  const general = info?.query?.general as
    { sitename: string; server: string; articlepath: string } | undefined
  if (!general) return null
  const server = general.server.startsWith('//') ? `https:${general.server}` : general.server
  return {
    name: general.sitename,
    api,
    articlePath: `${server}${general.articlepath}`,
    license: info?.query?.rightsinfo?.text || 'see the wiki for its license'
  }
}

// Words in a wiki's name that say nothing about which game it covers.
const GENERIC = new Set([
  'wiki',
  'wikia',
  'the',
  'official',
  'fandom',
  'community',
  'unofficial',
  'database',
  'encyclopedia',
  'of'
])

function nameWords(text: string): string[] {
  return (
    text
      .normalize('NFD')
      // Drop accents: "Ragnarök" -> "ragnarok".
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[™®©'’.!]/g, '')
      .replace(/&/g, 'and')
      .match(/[a-z0-9]+/g) ?? []
  )
}

// Looks for a game's community wiki on wiki.gg and Fandom by its name, e.g. "Marvel Rivals" ->
// marvelrivals.wiki.gg. Only the game's name is sent. Null if none is found.
export async function findWikiForGame(name: string): Promise<WikiSite | null> {
  const parts = nameWords(name)
  if (!parts.length) return null
  // Also without a trailing number ("Overwatch 2") or the part after a colon ("Call of Duty: …").
  const noNumber = parts.filter((p, i) => !(i === parts.length - 1 && /^\d+$/.test(p)))
  const beforeColon = name.includes(':') ? nameWords(name.split(':')[0]) : []
  const slugs = [
    ...new Set(
      [parts, noNumber, beforeColon]
        .filter((w) => w.length)
        .flatMap((w) => [w.join(''), w.join('-')])
    )
  ]
  const gameWords = new Set(parts.filter((p) => !/^\d+$/.test(p)))
  for (const slug of slugs) {
    for (const api of [`https://${slug}.wiki.gg/api.php`, `https://${slug}.fandom.com/api.php`]) {
      const site = await siteAt(api)
      if (!site) continue
      // Make sure the wiki is about this game: most words of its name are the game's words.
      const named = nameWords(site.name).filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w))
      const shared = named.filter((w) => gameWords.has(w)).length
      if (named.length && shared * 2 >= named.length) return site
    }
  }
  return null
}

// Finds a MediaWiki site from any address on it (for games players add themselves).
export async function discoverWiki(address: string): Promise<WikiSite> {
  let origin: string
  try {
    const url = new URL(address.trim())
    if (url.protocol !== 'https:') throw new Error('not https')
    origin = url.origin
  } catch {
    throw new Error('Enter the wiki’s address, starting with https://')
  }
  for (const path of ['/api.php', '/w/api.php', '/mediawiki/api.php']) {
    const info = await api<{
      query?: {
        general?: { sitename: string; server: string; articlepath: string }
        rightsinfo?: { text?: string }
      }
    }>(`${origin}${path}`, {
      action: 'query',
      meta: 'siteinfo',
      siprop: 'general|rightsinfo'
    }).catch(() => null)
    const general = info?.query?.general
    if (general) {
      const server = general.server.startsWith('//') ? `https:${general.server}` : general.server
      return {
        name: general.sitename,
        api: `${origin}${path}`,
        articlePath: `${server}${general.articlepath}`,
        license: info?.query?.rightsinfo?.text || 'see the wiki for its license'
      }
    }
  }
  throw new Error(
    'No wiki found at that address. GameMate works with MediaWiki sites such as Fandom and wiki.gg.'
  )
}
