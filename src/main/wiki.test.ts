import { afterEach, describe, expect, it, vi } from 'vitest'
import { htmlToText, prefetchWiki, type WikiSite } from './wiki'

const site: WikiSite = {
  name: 'Test Wiki',
  api: 'https://wiki.test/api.php',
  articlePath: 'https://wiki.test/w/$1',
  license: 'CC BY-SA'
}

// A tiny wiki: these pages exist, and these redirects lead to them.
const PAGES = [
  'Ender Dragon',
  'Wolf',
  'Taming',
  'Music Disc 5',
  'Minecraft',
  'Wheat (disambiguation)'
]
const REDIRECTS: Record<string, string> = {
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
        .map((t) => ({ from: t, to: REDIRECTS[t] }))
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
