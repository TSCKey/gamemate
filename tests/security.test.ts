import { join } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, ipcMain: {}, shell: {} }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const { isOwnPage } = await import('../src/main/system/security')

describe('isOwnPage', () => {
  // Where security.ts looks for GameMate's page, seen from its own folder.
  const page = pathToFileURL(join(__dirname, '../src/main/renderer/index.html')).href

  it("accepts GameMate's interface in any of its windows", () => {
    expect(isOwnPage(page)).toBe(true)
    expect(isOwnPage(`${page}#overlay`)).toBe(true)
  })

  it('refuses other files and websites', () => {
    expect(isOwnPage(pathToFileURL(join(__dirname, 'other.html')).href)).toBe(false)
    expect(isOwnPage('https://example.com/')).toBe(false)
    expect(isOwnPage('not a url')).toBe(false)
  })
})
