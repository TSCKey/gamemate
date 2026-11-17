import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-companion-names-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('koffi', () => ({ default: {} }))

const settingsFile = join(userData, 'settings.json')
const wiki = {
  name: 'Hollow Knight Wiki',
  api: 'https://wiki.example/api.php',
  articlePath: 'https://wiki.example/wiki/$1',
  license: 'CC BY-SA'
}

const load = async (
  settings: object
): Promise<{
  names: typeof import('../src/main/companion/names')
  silksong: typeof import('../src/main/companion/silksongNames')
  wiki: typeof import('../src/main/games/wiki')
}> => {
  writeFileSync(settingsFile, JSON.stringify(settings))
  vi.resetModules()
  return {
    names: await import('../src/main/companion/names'),
    silksong: await import('../src/main/companion/silksongNames'),
    wiki: await import('../src/main/games/wiki')
  }
}

const reply = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 })

beforeEach(() => writeFileSync(settingsFile, '{}'))
afterEach(() => vi.unstubAllGlobals())

describe('matching text to known names', () => {
  const areas = ['Moss Grotto', 'Bone Bottom', 'Far Fields']

  it('ignores case', async () => {
    const { names } = await load({})
    expect(names.matchName('MOSS GROTTO', areas)).toBe('Moss Grotto')
  })

  it('forgives a single misread letter', async () => {
    const { names } = await load({})
    expect(names.matchName('Moss Gr0tto', areas)).toBe('Moss Grotto')
  })

  it('rejects text that is too different', async () => {
    const { names } = await load({})
    expect(names.matchName('Mossy Grot', areas)).toBeNull()
  })

  it('ignores punctuation and decoration around the name', async () => {
    const { names } = await load({})
    expect(names.matchName('~ Moss Grotto ~', areas)).toBe('Moss Grotto')
  })

  it('finds the name next to a stray word', async () => {
    const { names } = await load({})
    expect(names.matchName('Moss Grotto lq', areas)).toBe('Moss Grotto')
  })

  it('matches a plain name that the wiki lists with a disambiguation', async () => {
    const { names, silksong } = await load({})
    expect(silksong.SILKSONG_FALLBACK.areas).toContain('The Abyss')
    expect(names.matchName('THE ABYSS', silksong.SILKSONG_FALLBACK.areas)).toBe('The Abyss')
  })

  it('prefers the longer name when two score the same', async () => {
    const { names, silksong } = await load({})
    expect(names.matchName('LOST LACE', silksong.SILKSONG_FALLBACK.bosses)).toBe('Lost Lace')
  })

  it('does not take ordinary text for a name', async () => {
    const { names, silksong } = await load({})
    const { bosses, areas } = silksong.SILKSONG_FALLBACK
    expect(names.matchName('narrow passage', [...areas, 'The Marrow'])).toBeNull()
    expect(names.matchName('narrow', areas)).toBeNull()
    expect(names.matchName('window', bosses)).toBeNull()
    expect(names.matchName('sharp', bosses)).toBeNull()
    expect(names.matchName('Silk Lace obtained', bosses)).toBeNull()
    expect(names.matchName('phantoms', bosses)).toBeNull()
  })

  it('ignores accents', async () => {
    const { names } = await load({})
    expect(names.matchName('Móss Grottö', areas)).toBe('Moss Grotto')
  })

  // The owner's recording showed this act card: "ACT 2" above, "CITADEL OF SONG" in the title spot.
  it('knows the area name shown on Silksong’s act card', async () => {
    const { names, silksong } = await load({})
    expect(names.matchName('CITADEL OF SONG', silksong.SILKSONG_FALLBACK.areas)).toBe(
      'Citadel of Song'
    )
  })

  it('returns nothing for empty text or no names', async () => {
    const { names } = await load({})
    expect(names.matchName('', areas)).toBeNull()
    expect(names.matchName('Moss Grotto', [])).toBeNull()
  })
})

describe('listing a wiki category', () => {
  it('returns titles and follows the continue marker', async () => {
    const { wiki: w } = await load({})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ query: { categorymembers: [{ title: 'A' }] }, continue: { cmcontinue: 'next' } })
      )
      .mockResolvedValueOnce(reply({ query: { categorymembers: [{ title: 'B' }] } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await w.categoryMembers(wiki, 'Bosses (Silksong)')).toEqual(['A', 'B'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('cmcontinue=next')
    expect(String(fetchMock.mock.calls[0][0])).toContain('cmtype=page')
  })

  it('stops at the limit', async () => {
    const { wiki: w } = await load({})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        reply({
          query: { categorymembers: [{ title: 'A' }, { title: 'B' }] },
          continue: { cmcontinue: 'more' }
        })
      )
    )
    expect(await w.categoryMembers(wiki, 'X', 3)).toEqual(['A', 'B', 'A'])
  })
})

describe('Silksong names', () => {
  const game = { id: 'g', name: 'Hollow Knight: Silksong', launcher: 'steam', wiki }

  it('uses the built-in lists when online lookups are off', async () => {
    const { silksong } = await load({ webLookup: false, games: [game] })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await silksong.silksongNames()).toEqual(silksong.SILKSONG_FALLBACK)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the built-in lists when no wiki is set', async () => {
    const { silksong } = await load({ webLookup: true, games: [{ ...game, wiki: undefined }] })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await silksong.silksongNames()).toEqual(silksong.SILKSONG_FALLBACK)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the built-in lists when the wiki cannot be reached', async () => {
    const { silksong } = await load({ webLookup: true, games: [game] })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await silksong.silksongNames()).toEqual(silksong.SILKSONG_FALLBACK)
  })

  it('adds wiki names to the built-in ones and remembers them for the session', async () => {
    const { silksong } = await load({ webLookup: true, games: [game] })
    const known = silksong.SILKSONG_FALLBACK.bosses[0]
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      reply({
        query: {
          categorymembers: url.includes('Bosses')
            ? [{ title: 'Brand New Boss' }, { title: known }]
            : [{ title: 'Brand New Area' }]
        }
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = await silksong.silksongNames()
    expect(first.bosses).toContain('Brand New Boss')
    expect(first.bosses.filter((n) => n === known)).toHaveLength(1)
    expect(first.areas).toContain('Brand New Area')
    expect(first.areas).toContain(silksong.SILKSONG_FALLBACK.areas[0])
    const calls = fetchMock.mock.calls.length
    await silksong.silksongNames()
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('drops a trailing disambiguation from live names and de-duplicates', async () => {
    const { silksong } = await load({ webLookup: true, games: [game] })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) =>
        reply({
          query: {
            categorymembers: url.includes('Bosses')
              ? [{ title: 'Lace (boss)' }, { title: 'Lace' }]
              : [{ title: 'The Abyss (Silksong)' }]
          }
        })
      )
    )
    const names = await silksong.silksongNames()
    expect(names.areas).toContain('The Abyss')
    expect(names.areas.some((n) => n.includes('('))).toBe(false)
    expect(names.bosses.filter((n) => n === 'Lace')).toHaveLength(1)
  })

  it('also reads sub-categories of the areas category, one level deep', async () => {
    const { silksong } = await load({ webLookup: true, games: [game] })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        const u = decodeURIComponent(String(url).replace(/\+/g, ' '))
        if (u.includes('Bosses')) return reply({ query: { categorymembers: [] } })
        if (u.includes('cmtype=subcat')) {
          return reply({
            query: {
              categorymembers: u.includes('Areas (Silksong)')
                ? [{ title: 'Category:Sub-areas' }]
                : []
            }
          })
        }
        return reply({
          query: {
            categorymembers: u.includes('Category:Sub-areas') ? [{ title: 'Hidden Cavern' }] : []
          }
        })
      })
    )
    expect((await silksong.silksongNames()).areas).toContain('Hidden Cavern')
  })

  it('has built-in names for bosses and areas', async () => {
    const { silksong } = await load({})
    expect(silksong.SILKSONG_FALLBACK.bosses.length).toBeGreaterThan(10)
    expect(silksong.SILKSONG_FALLBACK.areas).toContain('Moss Grotto')
  })
})
