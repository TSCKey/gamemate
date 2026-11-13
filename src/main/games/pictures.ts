// Pictures from game wikis: area maps, the picture of what a page is about, and Minecraft's
// inventory icons for recipe cards. GameMate downloads each picture here and checks it, then
// hands it to its windows as a data: URL, so the windows themselves never go online.
import type { WikiPicture, WikiSite } from '../../shared/types'
import { pageUrl, queryWiki, USER_AGENT } from './wiki'
import { BoundedCache } from '../../shared/boundedCache'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
// Raster formats only: an SVG can contain scripts.
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)$/
// The wiki scales pictures down to these widths (vector files arrive as PNG too).
const PICTURE_WIDTH = 480
const MAP_WIDTH = 900
const CACHE_MS = 30 * 60_000

// Downloads a picture and returns it as a data: URL, or null if it isn't a safe, small raster
// image served over HTTPS.
export async function downloadPicture(url: string): Promise<string | null> {
  try {
    if (new URL(url).protocol !== 'https:') return null
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok || new URL(res.url || url).protocol !== 'https:') return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!IMAGE_TYPES.test(type)) return null
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return null
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

interface FileInfo {
  // The file page's title, e.g. "File:Forgotten Crossroads Map.png".
  title: string
  // Address of the (scaled-down) picture.
  src: string
}

// Looks up files (with or without "File:"), following redirects; keyed by the name asked for.
async function fileInfo(
  site: WikiSite,
  files: string[],
  width: number
): Promise<Map<string, FileInfo>> {
  const titles = files.map((f) => (f.startsWith('File:') ? f : `File:${f}`))
  const found = new Map<string, FileInfo>()
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const data = await queryWiki<{
      query?: {
        normalized?: { from: string; to: string }[]
        redirects?: { from: string; to: string }[]
        pages?: {
          title: string
          missing?: boolean
          imageinfo?: { url: string; thumburl?: string }[]
        }[]
      }
    }>(site.api, {
      action: 'query',
      titles: batch.join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(width),
      redirects: '1'
    }).catch(() => null)
    const query = data?.query
    const pages = new Map((query?.pages ?? []).map((p) => [p.title, p]))
    for (const title of batch) {
      const normal = query?.normalized?.find((n) => n.from === title)?.to ?? title
      const final = query?.redirects?.find((r) => r.from === normal)?.to ?? normal
      const info = pages.get(final)?.imageinfo?.[0]
      if (info) found.set(title, { title: final, src: info.thumburl ?? info.url })
    }
  }
  return found
}

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? []

// The best map among a page's files: named after the place and "map", shortest name first
// ("Forgotten Crossroads Map" over "Forgotten Crossroads Map Clean").
export function pickMap(place: string, files: string[]): string | undefined {
  const wanted = words(place)
  return files
    .filter((file) => {
      const name = words(file.replace(/^File:/, '').replace(/\.\w+$/, ''))
      return name.includes('map') && wanted.every((w) => name.includes(w))
    })
    .sort((a, b) => a.length - b.length)[0]
}

// Pictures are kept as whole images, so only the latest few stay in memory.
const cache = new BoundedCache<Promise<WikiPicture | null>>(40, CACHE_MS)

// A picture for a wiki page: its area map when the player asked for a map (if the wiki has one),
// otherwise the page's main picture.
export function pagePicture(
  site: WikiSite,
  title: string,
  wantMap: boolean
): Promise<WikiPicture | null> {
  const key = `${site.api} ${title} ${wantMap}`
  const hit = cache.get(key)
  if (hit) return hit
  const picture = findPagePicture(site, title, wantMap).catch(() => null)
  cache.set(key, picture)
  return picture
}

async function findPagePicture(
  site: WikiSite,
  title: string,
  wantMap: boolean
): Promise<WikiPicture | null> {
  const data = await queryWiki<{
    query?: {
      pages?: { title: string; pageimage?: string; images?: { title: string }[] }[]
    }
  }>(site.api, {
    action: 'query',
    titles: title,
    prop: 'pageimages|images',
    piprop: 'name',
    imlimit: '100',
    redirects: '1'
  })
  const page = data.query?.pages?.[0]
  if (!page) return null

  if (wantMap) {
    let map = pickMap(
      page.title,
      (page.images ?? []).map((i) => i.title)
    )
    if (!map) {
      const search = await queryWiki<{ query?: { search?: { title: string }[] } }>(site.api, {
        action: 'query',
        list: 'search',
        srnamespace: '6',
        srsearch: `${page.title} map`,
        srlimit: '10'
      }).catch(() => null)
      map = pickMap(page.title, search?.query?.search?.map((r) => r.title) ?? [])
    }
    const picture = map && (await toPicture(site, map, MAP_WIDTH, `Map of ${page.title}`, 'map'))
    if (picture) return picture
  }
  if (!page.pageimage) return null
  return toPicture(site, page.pageimage, PICTURE_WIDTH, page.title, 'picture')
}

async function toPicture(
  site: WikiSite,
  file: string,
  width: number,
  caption: string,
  kind: WikiPicture['kind']
): Promise<WikiPicture | null> {
  const info = [...(await fileInfo(site, [file], width)).values()][0]
  const src = info && (await downloadPicture(info.src))
  return src ? { src, caption, url: pageUrl(site, info.title), wiki: site.name, kind } : null
}

// Minecraft's inventory icons by item name (they're tiny): the ones used most recently.
const icons = new BoundedCache<Promise<string | null>>(400)

// Inventory icons ("Invicon Oak Planks.png", some animated .gif) for items, by item name.
export async function minecraftIcons(
  site: WikiSite,
  items: string[]
): Promise<Record<string, string>> {
  const missing = [...new Set(items)].filter((name) => !icons.has(name))
  if (missing.length) {
    const lookup = fileInfo(
      site,
      missing.flatMap((name) => [`Invicon ${name}.png`, `Invicon ${name}.gif`]),
      // Icons are already small; no scaling.
      64
    ).catch(() => null)
    for (const name of missing) {
      const icon = lookup.then((found) => {
        const info =
          found?.get(`File:Invicon ${name}.png`) ?? found?.get(`File:Invicon ${name}.gif`)
        return info ? downloadPicture(info.src) : null
      })
      icons.set(name, icon)
      // Only an icon the wiki doesn't have is remembered as missing; after a network
      // problem, the next recipe tries again.
      void icon.then(async (src) => {
        if (!src && (await lookup) === null) icons.delete(name)
      })
    }
  }
  const out: Record<string, string> = {}
  // Collected before waiting for any, so a long recipe list can't push its own icons out.
  const wanted = [...new Set(items)].map((name) => [name, icons.get(name)] as const)
  for (const [name, icon] of wanted) {
    const src = await icon
    if (src) out[name] = src
  }
  return out
}
