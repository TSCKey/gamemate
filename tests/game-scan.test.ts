import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fresh temporary data folder per test, and stand-ins for the launchers and the wikis.
let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..'), quit: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {} },
  shell: {},
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('koffi', () => ({ default: {} }))

const game = (n: number): { id: string; name: string; launcher: 'steam' } => ({
  id: `game-${n}`,
  name: `Game ${n}`,
  launcher: 'steam'
})
let found = [game(1)]
vi.mock('../src/main/games/launchers', () => ({ scanLaunchers: async () => found }))

// Each wiki lookup waits until the test lets it finish, so a test can act in the middle of a scan.
const lookups: Array<() => void> = []
const findWikiForGame = vi.fn(
  () => new Promise<undefined>((resolve) => lookups.push(() => resolve(undefined)))
)
vi.mock('../src/main/games/wiki', () => ({
  findWikiForGame: () => findWikiForGame(),
  discoverWiki: async () => null,
  findWikiCandidates: async () => []
}))

let settings: typeof import('../src/main/system/settings')
let scanGames: typeof import('../src/main/ipc/games').scanGames

const whileLookingUp = async (): Promise<void> => {
  await vi.waitFor(() => expect(lookups.length).toBeGreaterThan(0))
}
const finishLookups = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    lookups.splice(0).forEach((finish) => finish())
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'gamemate-scan-'))
  found = [game(1)]
  lookups.length = 0
  findWikiForGame.mockClear()
  vi.resetModules()
  settings = await import('../src/main/system/settings')
  ;({ scanGames } = await import('../src/main/ipc/games'))
  settings.acceptTerms()
  settings.updateSettings({ deviceConsent: true })
})

describe('the game scan', () => {
  it('saves the games it found', async () => {
    const scan = scanGames()
    await whileLookingUp()
    await finishLookups()
    await scan

    expect(settings.getSettings().games.map((g) => g.id)).toEqual(['game-1'])
  })

  it('saves nothing when the player deletes their data during the scan', async () => {
    const scan = scanGames()
    await whileLookingUp()
    settings.resetSettings()
    await finishLookups()
    await scan

    expect(settings.getSettings().games).toEqual([])
  })

  it('saves nothing when the player takes back their consent during the scan', async () => {
    const scan = scanGames()
    await whileLookingUp()
    settings.updateSettings({ deviceConsent: false })
    await finishLookups()
    await scan

    expect(settings.getSettings().games).toEqual([])
  })

  it('saves nothing when the player withdraws the Terms during the scan', async () => {
    const scan = scanGames()
    await whileLookingUp()
    settings.withdrawTerms()
    await finishLookups()
    await scan

    expect(settings.getSettings().games).toEqual([])
  })

  it('stops sending game names to the wikis once consent is gone', async () => {
    found = Array.from({ length: 20 }, (_, i) => game(i))
    const scan = scanGames()
    await whileLookingUp()
    const started = findWikiForGame.mock.calls.length
    settings.updateSettings({ deviceConsent: false })
    await finishLookups()
    await scan

    expect(findWikiForGame).toHaveBeenCalledTimes(started)
  })
})
