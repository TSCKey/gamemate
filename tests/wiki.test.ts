import { afterEach, describe, expect, it, vi } from 'vitest'
import { htmlToText, prefetchWiki, type WikiSite } from '../src/main/games/wiki'

const site: WikiSite = {
  name: 'Test Wiki',
  api: 'https://wiki.test/api.php',
  articlePath: 'https://wiki.test/w/$1',
  license: 'CC BY-SA'
}

// A tiny wiki: these pages exist, and these redirects lead to them.
const PAGES = [
  'Fungal Wastes',
  'Ender Dragon',
  'Wolf',
  'Taming',
  'Music Disc 5',
  'Minecraft',
  'Wheat (disambiguation)'
]
// Redirects to a section of another page.
const FRAGMENTS: Record<string, string> = { 'Mantis Village': 'Sub-area: Mantis Village' }
const REDIRECTS: Record<string, string> = {
  'Mantis Village': 'Fungal Wastes',
  Tame: 'Taming',
  Five: 'Music Disc 5',
  Hey: 'Wheat (disambiguation)'
}

function fakeWiki(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const params = new URL(url).searchParams
      const titles = (params.get('titles') ?? '').split('|')
      if (params.get('prop') === 'extracts') {
        return Response.json({
          query: { pages: [{ title: titles[0], extract: `About ${titles[0]}.` }] }
        })
      }
      const redirects = titles
        .filter((t) => REDIRECTS[t])
        .map((t) => ({ from: t, to: REDIRECTS[t], tofragment: FRAGMENTS[t] }))
      const resolved = titles.map((t) => REDIRECTS[t] ?? t)
      return Response.json({
        query: {
          redirects,
          pages: [...new Set(resolved)].map((title) =>
            PAGES.includes(title) ? { title } : { title, missing: true }
          )
        }
      })
    })
  )
}

const found = async (question: string): Promise<string[]> =>
  (await prefetchWiki(site, question, 'Minecraft')).map((p) => p.source?.title ?? '')

afterEach(() => vi.unstubAllGlobals())

describe('prefetchWiki', () => {
  it('finds the page a question names, longest phrase first', async () => {
    fakeWiki()
    expect(await found('How do I beat the ender dragon?')).toEqual(['Ender Dragon'])
  })

  it('prefers the subject named in the question over a redirect', async () => {
    fakeWiki()
    expect(await found('how do I tame wolves')).toEqual(['Wolf'])
  })

  it('ignores redirects to unrelated pages, disambiguation and the game itself', async () => {
    fakeWiki()
    expect(await found('say hi in five words')).toEqual([])
    expect(await found('hey')).toEqual([])
    expect(await found('is minecraft fun')).toEqual([])
  })

  it('follows a redirect to a section of another page', async () => {
    fakeWiki()
    expect(await found('Where is the Mantis Village?')).toEqual(['Fungal Wastes'])
  })

  it('gives the page text with a link to it', async () => {
    fakeWiki()
    const [page] = await prefetchWiki(site, 'tell me about the ender dragon', 'Minecraft')
    expect(page.text).toContain('About Ender Dragon.')
    expect(page.source?.url).toBe('https://wiki.test/w/Ender_Dragon')
  })
})

describe('htmlToText', () => {
  it('keeps the readable text of a page', () => {
    const text = htmlToText(
      '<p>Wolves can be <b>tamed</b> with bones&nbsp;&amp; more.</p><script>x()</script><ul><li>One</li><li>Two</li></ul>'
    )
    expect(text).toContain('Wolves can be tamed with bones & more.')
    expect(text).toContain('One')
    expect(text).not.toContain('x()')
  })
})

describe('reading the part of a page the question is about', () => {
  const page = [
    'Creepers are hostile mobs.',
    '== Spawning ==',
    'They spawn in the dark. '.repeat(120),
    '== Drops ==',
    '=== On death ===',
    'Gunpowder 0–2.',
    '== History ==',
    'Added in 2009.'
  ].join('\n')

  it('puts the asked-about section first and leaves out history', async () => {
    const { trimExtract, focusFor } = await import('../src/main/games/wiki')
    const text = trimExtract(page, focusFor('What does a creeper drop?'))
    expect(text.indexOf('Gunpowder')).toBeLessThan(text.indexOf('Spawning'))
    expect(text).not.toContain('2009')
  })

  it('notices sections that lost their table', async () => {
    const { hasEmptySection } = await import('../src/main/games/wiki')
    expect(hasEmptySection('Intro\n== Drops ==\n=== On death ===\n== Behavior ==\nText')).toBe(true)
    expect(hasEmptySection('Intro\n== Drops ==\nGunpowder\n== Behavior ==\nText')).toBe(false)
  })
})

describe('choosing the best wiki for a game', () => {
  it('prefers the liveliest wiki about the game and skips unrelated ones', async () => {
    const wikis: Record<string, object> = {
      'hollowbug.wiki.gg': { sitename: 'Hollow Bug Wiki', articles: 64, activeusers: 0 },
      'hollowbug.fandom.com': { sitename: 'Hollow Bug Wiki', articles: 3000, activeusers: 50 },
      'hollow-bug.fandom.com': { sitename: 'Cooking Wiki', articles: 9000, activeusers: 90 }
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const host = new URL(url).host
        const wiki = wikis[host] as { sitename: string; articles: number; activeusers: number }
        if (!wiki) return new Response('', { status: 404 })
        return Response.json({
          query: {
            general: {
              sitename: wiki.sitename,
              server: `https://${host}`,
              articlepath: '/wiki/$1'
            },
            statistics: { articles: wiki.articles, activeusers: wiki.activeusers }
          }
        })
      })
    )
    const { findWikiCandidates } = await import('../src/main/games/wiki')
    const found = await findWikiCandidates('Hollow Bug')
    expect(found.map((c) => new URL(c.site.api).host)).toEqual([
      'hollowbug.fandom.com',
      'hollowbug.wiki.gg'
    ])
  })
})
