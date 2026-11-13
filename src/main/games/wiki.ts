// Looks things up on a game's wiki (any MediaWiki site: minecraft.wiki, wiki.gg, Fandom, …) for
import type { WikiSite, WikiSource } from '../../shared/types'
import { t } from '../system/i18n'
import { BoundedCache } from '../../shared/boundedCache'
export type { WikiSite, WikiSource }
// questions GameMate's own data can't answer. Only the search words are sent. Wiki text is under
// the wiki's license (usually Creative Commons), so every answer that uses it links to the page.

export const USER_AGENT = 'GameMate/1.0 (https://github.com/TSCKey/gamemate)'
const TIMEOUT_MS = 8_000
const MAX_CHARS = 4_000
// The intro's share when the page has sections the question is about.
const INTRO_CHARS = 1_200
const CACHE_MS = 30 * 60_000
// Sections that rarely help a player mid-game.
const SKIP_SECTIONS =
  /^(history|gallery|trivia|references|videos|sounds|data values|achievements|advancements|issues|external links|development|see also|navigation|patch history|version history|update history|changelog|bugs|cut content|concept art|transcript|dialogue|official images)/i

export interface WikiLookup {
  text: string
  source: WikiSource | null
}

const cache = new BoundedCache<WikiLookup>(100, CACHE_MS)

// Calls a wiki's MediaWiki API (JSON, format version 2).
export async function queryWiki<T>(apiUrl: string, params: Record<string, string>): Promise<T> {
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

// Section names worth reading first for a kind of question ("where is …" → Location).
const QUESTION_SECTIONS: [RegExp, string[]][] = [
  [/\b(where|find|found|location|located)\b/i, ['locat', 'spawn', 'found', 'obtai', 'map']],
  [/\b(get|obtain|farm|farming)\b/i, ['obtai', 'locat', 'drop', 'farm']],
  [/\b(beat|defeat|kill|fight|boss|cheese)\b/i, ['strat', 'tips', 'behav', 'attac', 'fight']],
  [/\b(craft\w*|make|recipes?|build)\b/i, ['craft', 'recip', 'usage', 'obtai']],
  [/\b(drops?|loot)\b/i, ['drop', 'loot']]
]

// What a question is about, as word beginnings to look for in section names.
export function focusFor(question: string): string[] {
  const stems = new Set<string>()
  for (const [pattern, sections] of QUESTION_SECTIONS) {
    if (pattern.test(question)) sections.forEach((stem) => stems.add(stem))
  }
  for (const word of words(question)) {
    if (word.length >= 4 && !QUESTION_WORDS.has(word)) stems.add(word.slice(0, 5))
  }
  return [...stems]
}

const matches = (heading: string, focus: string[]): boolean =>
  words(heading).some((w) =>
    focus.some((stem) => w.startsWith(stem) || stem.startsWith(w.slice(0, 5)))
  )

// Keeps the intro and the useful sections up to MAX_CHARS: first the sections the question is
// about (for "what does a creeper drop?", Drops), then the others in page order.
export function trimExtract(extract: string, focus: string[] = []): string {
  const parts = extract.split(/\n(?===+ [^=]+ ==+)/)
  // Top-level sections with their subsections.
  const groups: { heading: string; parts: string[] }[] = [{ heading: '', parts: [] }]
  for (const part of parts) {
    const heading = /^(=+) ([^=]+?) =+/.exec(part)
    if (heading && heading[1].length === 2) groups.push({ heading: heading[2].trim(), parts: [] })
    groups[groups.length - 1].parts.push(part)
  }
  const [intro, ...sections] = groups
  const useful = sections.filter((g) => !SKIP_SECTIONS.test(g.heading))
  const wanted = (g: { heading: string; parts: string[] }): boolean =>
    focus.length > 0 &&
    g.parts.some((part) => matches(/^=+ ([^=]+?) =+/.exec(part)?.[1] ?? '', focus))
  const first = useful.filter(wanted)
  // When the page has sections the question is about, a long intro (often an info box) must not
  // use up the space before them.
  const lead =
    first.length && intro.parts.join('\n').length > INTRO_CHARS
      ? { heading: '', parts: [intro.parts.join('\n').slice(0, INTRO_CHARS) + '…'] }
      : intro
  const ordered = [lead, ...first, ...useful.filter((g) => !wanted(g))]

  const kept: string[] = []
  let length = 0
  for (const part of ordered.flatMap((g) => g.parts)) {
    const clean = part.replace(/\n{3,}/g, '\n\n').trim()
    // Skip headings left without text.
    if (!clean || /^=+ [^=]+ =+$/.test(clean)) continue
    if (length + clean.length > MAX_CHARS) {
      kept.push(clean.slice(0, MAX_CHARS - length) + '…')
      break
    }
    kept.push(clean)
    length += clean.length
  }
  return kept.join('\n\n')
}

// True when a page's plain text has a section without any text: the wiki built it from a table
// or template that plain text leaves out (minecraft.wiki's Drops, for example).
export function hasEmptySection(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const level = (line: string): number => /^(=+) [^=]+ =+$/.exec(line)?.[1].length ?? 0
  return lines.some((line, i) => {
    const here = level(line)
    if (!here) return false
    const next = lines[i + 1]
    return next === undefined || (level(next) > 0 && level(next) <= here)
  })
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
  const search = await queryWiki<{ query?: { search?: { title: string }[] } }>(site.api, {
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: '5'
  }).catch(() => null)
  const found = bestTitle(query, search?.query?.search?.map((r) => r.title) ?? [])
  if (found) return found
  // Some wikis have full-text search turned off; title suggestions still work.
  const suggest = await queryWiki<[string, string[]]>(site.api, {
    action: 'opensearch',
    search: query,
    namespace: '0',
    limit: '5'
  }).catch(() => null)
  return bestTitle(query, suggest?.[1] ?? [])
}

// Pages read recently, as plain text, so different questions about a page don't fetch it again.
const pages = new BoundedCache<Promise<{ title: string; text: string }>>(40, CACHE_MS)

function pageText(site: WikiSite, title: string): Promise<{ title: string; text: string }> {
  const key = `${site.api} ${title}`
  const hit = pages.get(key)
  if (hit) return hit
  const page = fetchPageText(site, title)
  pages.set(key, page)
  page.catch(() => pages.delete(key))
  return page
}

// The page's plain text, or its rendered text when the plain text misses parts (tables and
// templates, such as lists of drops or stats) or the wiki has no plain-text version.
async function fetchPageText(
  site: WikiSite,
  title: string
): Promise<{ title: string; text: string }> {
  const extracts = await queryWiki<{ query?: { pages?: { title: string; extract?: string }[] } }>(
    site.api,
    { action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: title }
  ).catch(() => null)
  const page = extracts?.query?.pages?.[0]
  if (page?.extract && !hasEmptySection(page.extract)) {
    return { title: page.title, text: page.extract }
  }
  const parsed = await queryWiki<{ parse?: { title: string; text?: string } }>(site.api, {
    action: 'parse',
    page: page?.title ?? title,
    prop: 'text',
    redirects: '1',
    disableeditsection: '1',
    disablelimitreport: '1'
  }).catch((error: unknown) => {
    if (page?.extract) return null
    throw error
  })
  if (!parsed?.parse?.text) return { title: page?.title ?? title, text: page?.extract ?? '' }
  return {
    title: parsed.parse.title ?? title,
    text: htmlToText(withoutContents(parsed.parse.text))
  }
}

// The rendered page's table of contents would only repeat the section names.
function withoutContents(html: string): string {
  return html.replace(/<div[^>]*\bid="toc"[\s\S]*?<\/ul>\s*<\/div>/i, '')
}

export async function lookupWiki(site: WikiSite, query: string): Promise<WikiLookup> {
  const q = query.trim().slice(0, 200)
  if (!q) return { text: 'No search words given.', source: null }
  const key = `${site.api} ${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit

  const title = await findTitle(site, q)
  if (!title) return { text: `The ${site.name} has no page about "${q}".`, source: null }
  const result = await readPage(site, title, focusFor(q))
  cache.set(key, result)
  return result
}

async function readPage(site: WikiSite, title: string, focus: string[] = []): Promise<WikiLookup> {
  const page = await pageText(site, title)
  const text = trimExtract(page.text, focus)
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
  return result
}

// Question words that make wiki searches worse.
const QUESTION_WORDS = new Set(
  `a about an and any anything are at be best can could do does explain find for from game games
  get good have hello help hey hi how i if image in is it know many me much my need ok on or photo
  picture play playing please should show so some tell thanks that there this to use want way what
  when where which who why will with work works would you`.split(/\s+/)
)
const prefetched = new BoundedCache<WikiLookup[]>(40, CACHE_MS)

// The meaningful words of a question, for a web search: "What are the characters currently in
// meta in Overwatch?" -> "characters currently meta overwatch".
export function searchTerms(question: string): string[] {
  // "best" doesn't help find a wiki page, but does help a web search ("best build").
  return words(question).filter(
    (w) => (w === 'best' || !QUESTION_WORDS.has(w)) && !TITLE_JOINERS.has(w) && w.length > 1
  )
}

// Small words that belong inside page titles ("Rivers of Blood", "The End").
const TITLE_JOINERS = new Set(['of', 'the'])

// A word and the singular forms it may have ("wolves" → "wolf", "berries" → "berry").
function singulars(word: string): string[] {
  return [
    ...new Set([
      word,
      word.replace(/ies$/, 'y'),
      word.replace(/ves$/, 'f'),
      word.replace(/ves$/, 'fe'),
      word.replace(/(ch|sh|x|ss)es$/, '$1'),
      word.replace(/(?<=[^s])s$/, '')
    ])
  ]
}

// Finds the page a question is clearly about before the AI is asked, which saves it a lookup
// round. The question's own phrases are tried as page titles ("how do I beat the Ender Dragon"
// finds "Ender Dragon"), longest first, and never the page about the game itself.
export async function prefetchWiki(
  site: WikiSite,
  question: string,
  gameName: string
): Promise<WikiLookup[]> {
  const game = new Set(words(gameName))
  // Runs of meaningful words: question words split them.
  const runs: string[][] = [[]]
  for (const word of words(question)) {
    if (QUESTION_WORDS.has(word)) runs.push([])
    else runs[runs.length - 1].push(word)
  }
  // Longest phrases first; a phrase may start with "the" but not end with a joiner.
  const phrases: string[][] = []
  for (let size = 4; size > 0; size--) {
    for (const run of runs) {
      for (let i = 0; i + size <= run.length; i++) {
        const phrase = run.slice(i, i + size)
        const meaningful = phrase.filter((w) => !TITLE_JOINERS.has(w))
        if (
          meaningful.some((w) => !game.has(w)) &&
          !TITLE_JOINERS.has(phrase.at(-1)!) &&
          phrase[0] !== 'of'
        ) {
          phrases.push(phrase)
        }
      }
    }
  }
  if (!phrases.length) return []

  // Wikis title pages "Ender Dragon", "Ender dragon" or "Rivers of Blood", about one thing
  // ("Diamond").
  const capital = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1)
  const tried = new Map<string, number>()
  for (const phrase of phrases) {
    const last = phrase[phrase.length - 1]
    const forms = singulars(last).map((word) => [...phrase.slice(0, -1), word])
    for (const form of forms) {
      const titled = form.map((w, i) => (i > 0 && TITLE_JOINERS.has(w) ? w : capital(w)))
      for (const title of [titled.join(' '), capital(form.join(' '))]) {
        if (!tried.has(title)) tried.set(title, phrase.filter((w) => !TITLE_JOINERS.has(w)).length)
      }
    }
  }
  const titles = [...tried.keys()].slice(0, 50)
  const focus = focusFor(question)
  // The same page is cut differently for different questions.
  const key = `${site.api} prefetch ${titles.join('|')} ${focus.join(',')}`
  const hit = prefetched.get(key)
  if (hit) return hit

  const data = await queryWiki<{
    query?: {
      normalized?: { from: string; to: string }[]
      redirects?: { from: string; to: string; tofragment?: string }[]
      pages?: { title: string; missing?: boolean; invalid?: boolean }[]
    }
  }>(site.api, { action: 'query', titles: titles.join('|'), redirects: '1' }).catch(() => null)
  const query = data?.query
  const redirectOf = (title: string): { to: string; tofragment?: string } | undefined => {
    const normal = query?.normalized?.find((n) => n.from === title)?.to ?? title
    return query?.redirects?.find((r) => r.from === normal)
  }
  const follow = (title: string): string =>
    redirectOf(title)?.to ?? query?.normalized?.find((n) => n.from === title)?.to ?? title
  // Redirects to a section ("Mantis Village" → "Fungal Wastes#Mantis Village"): that section is
  // what the question is about.
  const sectionOf = new Map<string, string>()
  const existing = new Set(
    (query?.pages ?? []).filter((pg) => !pg.missing && !pg.invalid).map((pg) => pg.title)
  )
  // A page named exactly like a phrase beats one reached through a redirect ("tame" leads to
  // "Taming", but "wolf" is the subject); longer phrases beat shorter ones. Two equally good
  // pages ("creeper" and "damage") are both read.
  const scored = new Map<string, number>()
  for (const [title, size] of tried) {
    const page = follow(title)
    const direct = page.toLowerCase() === title.toLowerCase()
    // A redirect only counts when it leads somewhere named like the phrase ("Tame" → "Taming"),
    // not to an unrelated page ("Five" → "Music Disc 5").
    const stems = words(title).map((w) => w.slice(0, 3))
    const fragment = redirectOf(title)?.tofragment
    if (fragment) sectionOf.set(page, fragment)
    const related =
      direct || Boolean(fragment) || words(page).some((w) => stems.some((s) => w.startsWith(s)))
    const score = size * 2 + (direct ? 1 : 0)
    if (
      related &&
      existing.has(page) &&
      !page.includes('/') &&
      !/\(disambiguation\)/i.test(page) &&
      !words(page).every((w) => game.has(w))
    ) {
      scored.set(page, Math.max(score, scored.get(page) ?? 0))
    }
  }
  const top = Math.max(0, ...scored.values())
  const best = [...scored].filter(([, score]) => score === top).slice(0, 2)
  const read = await Promise.all(
    best.map(([title]) => {
      const section = sectionOf.get(title)
      return readPage(site, title, section ? [...focus, ...focusFor(section)] : focus)
    })
  )
  const result = read.filter((page) => page.source)
  prefetched.set(key, result)
  return result
}

// A wiki that may cover a game, with how big and lively it is.
export interface WikiCandidate {
  site: WikiSite
  articles: number
  activeUsers: number
}

async function siteInfo(api: string): Promise<WikiCandidate | null> {
  const info = await fetch(
    `${api}?${new URLSearchParams({
      action: 'query',
      meta: 'siteinfo',
      siprop: 'general|rightsinfo|statistics',
      format: 'json',
      formatversion: '2'
    })}`,
    { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
  const general = info?.query?.general as
    { sitename: string; server: string; articlepath: string; scriptpath?: string } | undefined
  if (!general) return null
  const server = general.server.startsWith('//') ? `https:${general.server}` : general.server
  const stats = info?.query?.statistics as { articles?: number; activeusers?: number } | undefined
  return {
    site: {
      name: general.sitename,
      // The wiki's own address (Fandom answers for several names, e.g. silksong.fandom.com).
      api: `${server}${general.scriptpath ?? ''}/api.php`,
      articlePath: `${server}${general.articlepath}`,
      license: info?.query?.rightsinfo?.text ?? ''
    },
    articles: stats?.articles ?? 0,
    activeUsers: stats?.activeusers ?? 0
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

// The community wikis for a game on wiki.gg and Fandom, found by its name ("Marvel Rivals" ->
// marvelrivals.wiki.gg), best first: the liveliest (most active editors), then the biggest. A
// wiki that moved elsewhere keeps its pages but loses its editors, so it ranks low. Only the
// game's name is sent.
export async function findWikiCandidates(name: string): Promise<WikiCandidate[]> {
  const parts = nameWords(name)
  if (!parts.length) return []
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
  const found = await Promise.all(
    slugs.flatMap((slug) =>
      [`https://${slug}.wiki.gg/api.php`, `https://${slug}.fandom.com/api.php`].map(siteInfo)
    )
  )
  const candidates = new Map<string, WikiCandidate>()
  for (const candidate of found) {
    if (!candidate || candidates.has(candidate.site.api)) continue
    // Make sure the wiki is about this game: most words of its name are the game's words.
    const named = nameWords(candidate.site.name).filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w))
    const shared = named.filter((w) => gameWords.has(w)).length
    if (named.length && shared * 2 >= named.length) candidates.set(candidate.site.api, candidate)
  }
  return [...candidates.values()].sort(
    (a, b) => b.activeUsers - a.activeUsers || b.articles - a.articles
  )
}

export async function findWikiForGame(name: string): Promise<WikiSite | null> {
  return (await findWikiCandidates(name))[0]?.site ?? null
}

// Finds a MediaWiki site from any address on it (for games players add themselves).
export async function discoverWiki(address: string): Promise<WikiSite> {
  let origin: string
  try {
    const url = new URL(address.trim())
    if (url.protocol !== 'https:') throw new Error('not https')
    origin = url.origin
  } catch {
    throw new Error(t('errors.wiki.address'))
  }
  for (const path of ['/api.php', '/w/api.php', '/mediawiki/api.php']) {
    const info = await queryWiki<{
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
        license: info?.query?.rightsinfo?.text ?? ''
      }
    }
  }
  throw new Error(t('errors.wiki.notFound'))
}
