import { join } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, ipcMain: {}, shell: {} }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

const { isOwnPage, mediaAllowed } = await import('../src/main/system/security')

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

describe('mediaAllowed', () => {
  const ask = (
    types: string[] | null,
    over: Partial<Parameters<typeof mediaAllowed>[0]> = {}
  ): boolean =>
    mediaAllowed({ types, voiceInput: true, watchingFromThisPage: false, ownPage: true, ...over })

  it('allows the microphone only with voice input on', () => {
    expect(ask(['audio'])).toBe(true)
    expect(ask(['audio'], { voiceInput: false })).toBe(false)
  })

  it('allows a screen stream (no camera or microphone listed) only while watching from that page', () => {
    expect(ask([], { watchingFromThisPage: true })).toBe(true)
    expect(ask([], { watchingFromThisPage: true, voiceInput: false })).toBe(true)
  })

  it('refuses a screen stream when not watching, even with voice input on', () => {
    expect(ask([], { voiceInput: true, watchingFromThisPage: false })).toBe(false)
  })

  it('refuses the camera, alone or with the microphone', () => {
    expect(ask(['video'], { watchingFromThisPage: true })).toBe(false)
    expect(ask(['audio', 'video'], { watchingFromThisPage: true })).toBe(false)
  })

  it('refuses pages that are not GameMate', () => {
    expect(ask(['audio'], { ownPage: false })).toBe(false)
    expect(ask([], { ownPage: false, watchingFromThisPage: true })).toBe(false)
  })

  it('refuses requests that are not for media', () => {
    expect(ask(null, { watchingFromThisPage: true })).toBe(false)
  })
})
