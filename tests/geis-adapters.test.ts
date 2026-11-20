import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  screen: {},
  desktopCapturer: {},
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))
vi.mock('koffi', () => ({ default: {} }))
// Whether the kill-feed text reader is downloaded.
let readerInstalled = false
vi.mock('../src/main/ocr/paddle', () => ({
  paddleReady: () => readerInstalled,
  readWithPaddle: async () => [],
  stopPaddle: async () => {}
}))

await import('../src/main/system/settings')
const { adapterFor } = await import('../src/main/geis/adapter')
const { createAdapters } = await import('../src/main/geis/adapters')
type Host = import('../src/main/geis/adapter').AdapterHost
type Adapter = import('../src/main/geis/adapter').GameAdapter

const host: Host = {
  observe: () => [],
  speakIfDue: async () => {},
  showCommentsOn: () => {},
  setState: () => {},
  status: () => 'watching',
  recentEvents: () => [],
  inFight: () => false,
  forgets: () => 0
}

const game = (name: string): Parameters<typeof adapterFor>[1] => ({
  id: name.toLowerCase(),
  name,
  exes: [],
  watchFor: 'anything',
  examples: ['a', 'b']
})

describe('choosing how to follow a game', () => {
  const adapters = createAdapters(host)

  it('follows Silksong with the light screen checks', () => {
    expect(adapterFor(adapters, game('Hollow Knight: Silksong')).id).toBe('silksong')
  })

  it('reads the kill feed in games with a known layout', () => {
    for (const name of ['VALORANT', 'Overwatch 2', 'Counter-Strike 2', 'Apex Legends']) {
      expect(adapterFor(adapters, game(name)).id).toBe('killfeed')
    }
  })

  it('reads Apex Legends’ HUD as text once the text reader is downloaded', () => {
    readerInstalled = true
    expect(adapterFor(adapters, game('Apex Legends')).id).toBe('apex')
    expect(adapterFor(adapters, game('VALORANT')).id).toBe('killfeed')
    readerInstalled = false
    expect(adapterFor(adapters, game('Apex Legends')).id).toBe('killfeed')
  })

  it('looks at the whole screen in any other game', () => {
    for (const name of ['Minecraft', 'Elden Ring', 'Hollow Knight']) {
      expect(adapterFor(adapters, game(name)).id).toBe('vision-look')
    }
  })

  it('keeps the first of two that serve a game equally well', () => {
    const make = (id: string, score: number): Adapter => ({
      id,
      matches: () => score,
      tickMs: 1,
      watch: async () => {},
      stop: () => {}
    })
    const pick = adapterFor([make('a', 2), make('b', 2), make('c', 1)], game('X'))
    expect(pick.id).toBe('a')
  })

  it('can stop any adapter that is not watching', () => {
    for (const adapter of adapters) expect(() => adapter.stop()).not.toThrow()
  })
})
