import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadPicture, minecraftIcons, pagePicture, pickMap } from '../src/main/games/pictures'
import type { WikiSite } from '../src/shared/types'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

function image(type = 'image/png', bytes: Uint8Array<ArrayBuffer> = PNG): Response {
  return new Response(bytes, { headers: { 'Content-Type': type } })
}

afterEach(() => vi.unstubAllGlobals())

describe('downloadPicture', () => {
  it('returns a raster image as a data: URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => image())
    )
    expect(await downloadPicture('https://wiki.test/a.png')).toBe(
      `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    )
  })

  it('refuses plain HTTP, SVG, other files and very large pictures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => image())
    )
    expect(await downloadPicture('http://wiki.test/a.png')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => image('image/svg+xml'))
    )
    expect(await downloadPicture('https://wiki.test/a.svg')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => image('text/html'))
    )
    expect(await downloadPicture('https://wiki.test/a.png')).toBeNull()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => image('image/png', new Uint8Array(3 * 1024 * 1024)))
    )
    expect(await downloadPicture('https://wiki.test/big.png')).toBeNull()
  })

  it('gives up quietly when the wiki is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    )
    expect(await downloadPicture('https://wiki.test/a.png')).toBeNull()
  })
})

describe('pickMap', () => {
  it("prefers the place's plain map", () => {
    expect(
      pickMap('Forgotten Crossroads', [
        'File:Ancestral Mound Map.png',
        'File:Forgotten Crossroads Map Clean.png',
        'File:Forgotten Crossroads Map.png',
        'File:Forgotten Crossroads.png'
      ])
    ).toBe('File:Forgotten Crossroads Map.png')
  })

  it('finds nothing when no file is a map of the place', () => {
    expect(pickMap('Greenpath', ['File:Greenpath.png', 'File:Crossroads Map.png'])).toBeUndefined()
  })
})

// A tiny wiki: an area page with a map, and a boss page with only a main picture.
const site: WikiSite = {
  name: 'Test Wiki',
  api: 'https://wiki.test/api.php',
  articlePath: 'https://wiki.test/wiki/$1',
  license: 'CC BY-SA'
}

function fakeWiki(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.pathname !== '/api.php') return image()
      const p = u.searchParams
      if (p.get('prop') === 'pageimages|images') {
        const title = p.get('titles')
        const images =
          title === 'Forgotten Crossroads'
            ? [{ title: 'File:Forgotten Crossroads Map.png' }, { title: 'File:Husk.png' }]
            : [{ title: 'File:Hornet.png' }]
        return Response.json({
          query: { pages: [{ title, pageimage: `${title}.png`, images }] }
        })
      }
      if (p.get('list') === 'search') return Response.json({ query: { search: [] } })
      if (p.get('prop') === 'imageinfo') {
        const pages = (p.get('titles') ?? '')
          .split('|')
          .map((title) =>
            title.endsWith('.gif')
              ? { title, missing: true }
              : { title, imageinfo: [{ url: `https://img.test/${encodeURIComponent(title)}` }] }
          )
        return Response.json({ query: { pages } })
      }
      return Response.json({})
    })
  )
}

describe('pagePicture', () => {
  it("shows the area's map when the player asked for a map", async () => {
    fakeWiki()
    const picture = await pagePicture(site, 'Forgotten Crossroads', true)
    expect(picture?.kind).toBe('map')
    expect(picture?.caption).toBe('Map of Forgotten Crossroads')
    expect(picture?.url).toBe('https://wiki.test/wiki/File%3AForgotten_Crossroads_Map.png')
    expect(picture?.src.startsWith('data:image/png;base64,')).toBe(true)
  })

  it("falls back to the page's main picture when there is no map", async () => {
    fakeWiki()
    const picture = await pagePicture(site, 'Hornet', true)
    expect(picture?.kind).toBe('picture')
    expect(picture?.caption).toBe('Hornet')
  })
})

describe('minecraftIcons', () => {
  it("gets each item's inventory icon once", async () => {
    fakeWiki()
    const icons = await minecraftIcons(site, ['Oak Planks', 'Stick', 'Oak Planks'])
    expect(Object.keys(icons).sort()).toEqual(['Oak Planks', 'Stick'])
  })
})
