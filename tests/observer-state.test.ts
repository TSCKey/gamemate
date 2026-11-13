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

await import('../src/main/system/settings')
const { changes } = await import('../src/main/companion/observer')

const state = { status: 'watching' as const, game: 'Minecraft', paused: false, events: [] }

describe("the companion's state", () => {
  it('is only sent to the windows and the tray when something changed', () => {
    // Every few seconds the companion finds the same game still in front.
    expect(changes(state, { status: 'watching', game: 'Minecraft' })).toBe(false)
    expect(changes(state, { events: [] })).toBe(false)
    expect(changes(state, { status: 'analyzing' })).toBe(true)
    expect(changes(state, { game: 'Valorant' })).toBe(true)
    const event = {
      time: 1,
      type: 'death' as const,
      importance: 10,
      description: '',
      comment: '',
      spoken: false
    }
    expect(changes(state, { events: [event] })).toBe(true)
  })
})
