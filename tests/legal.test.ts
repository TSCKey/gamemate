import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseInline, parseMarkdown } from '../src/renderer/src/legal/markdown'

// GameMate's settings and request handling, without Electron: a temporary data folder and a
// stand-in for Electron's request channels.
const userData = mkdtempSync(join(tmpdir(), 'gamemate-legal-'))
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..'), quit: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) =>
      handlers.set(channel, fn)
  },
  shell: {},
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('koffi', () => ({ default: {} }))
vi.mock('../src/main/ai/llamaEngine', () => ({ stopEngine: async () => {} }))
vi.mock('../src/main/windows/overlay', () => ({ hideOverlay: () => {} }))

const settings = await import('../src/main/system/settings')
const { handle } = await import('../src/main/system/security')
const { registerLegalHandlers, AFTER_TERMS } = await import('../src/main/ipc/legal')
const { TERMS_VERSION } = await import('../src/shared/types')

const read = (name: string): string => readFileSync(join(__dirname, '..', 'docs', name), 'utf8')

describe('legal documents', () => {
  it('reads headings, lists, tables, bold text and links', () => {
    const blocks = parseMarkdown(
      '# Title\n\nSome **bold** and [a link](https://x.test).\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n'
    )
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'table'])
    expect(parseInline('Some **bold** and [a link](https://x.test).')).toEqual([
      { text: 'Some ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'a link', href: 'https://x.test' },
      { text: '.' }
    ])
  })

  it('shows both documents without leftover formatting marks', () => {
    for (const doc of ['TERMS.md', 'PRIVACY.md']) {
      const text = JSON.stringify(parseMarkdown(read(doc)))
      expect(text).not.toContain('**')
      expect(text).not.toContain('](')
      expect(text).toContain('Omar Abulebda')
      expect(text).toContain('TSCKey1@outlook.com')
    }
  })

  it('opens the links from web search, but not Google in general', async () => {
    const { allowedLink } = await import('../src/main/system/links')
    expect(allowedLink('https://vertexaisearch.cloud.google.com/grounding-api-redirect/x')).toBe(
      true
    )
    expect(allowedLink('https://www.google.com/search?q=silksong')).toBe(true)
    expect(allowedLink('https://www.google.com/maps')).toBe(false)
  })

  it('only links to pages GameMate may open', async () => {
    const { allowedLink } = await import('../src/main/system/links')
    for (const doc of ['TERMS.md', 'PRIVACY.md']) {
      for (const [, href] of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(TERMS|PRIVACY)\.md$/.test(href)) continue
        expect(allowedLink(href), href).toBe(true)
      }
    }
  })
})

describe('accepting the Terms of Use', () => {
  beforeEach(() => {
    settings.resetSettings()
  })

  it('starts unaccepted, and records when the Terms are accepted', () => {
    expect(settings.termsAccepted()).toBe(false)
    const accepted = settings.acceptTerms()
    expect(accepted.termsVersion).toBe(TERMS_VERSION)
    expect(Date.parse(accepted.termsAcceptedAt)).not.toBeNaN()
    expect(settings.termsAccepted()).toBe(true)
  })

  it('can be withdrawn, and a page cannot accept by changing settings', () => {
    settings.acceptTerms()
    settings.withdrawTerms()
    expect(settings.termsAccepted()).toBe(false)
    settings.updateSettings({ termsVersion: TERMS_VERSION, termsAcceptedAt: 'x' })
    expect(settings.termsAccepted()).toBe(false)
  })

  it('needs accepting again when the Terms change', () => {
    const old = { ...settings.acceptTerms(), termsVersion: TERMS_VERSION - 1 }
    expect(settings.termsAccepted(old)).toBe(false)
  })
})

describe('consent dates', () => {
  beforeEach(() => {
    settings.resetSettings()
  })

  it('records when a consent is given and forgets it when withdrawn', () => {
    const on = settings.updateSettings({ webLookup: true })
    expect(Date.parse(on.consents.lookups ?? '')).not.toBeNaN()
    // Changing something else keeps the original date.
    expect(settings.updateSettings({ voiceVolume: 0.5 }).consents.lookups).toBe(on.consents.lookups)
    expect(settings.updateSettings({ webLookup: false }).consents.lookups).toBeUndefined()
  })
})

describe('before the Terms are accepted', () => {
  const ownPage = {
    senderFrame: {
      parent: null,
      url: pathToFileURL(join(__dirname, '../src/main/renderer/index.html')).href
    }
  }

  it('refuses everything that goes online, reads the PC or captures the screen', async () => {
    handle('assistant:ask', () => 'answered')
    handle('settings:get', () => 'settings')
    registerLegalHandlers()
    settings.resetSettings()
    await expect(async () => handlers.get('assistant:ask')?.(ownPage)).rejects.toThrow(
      /Terms of Use/
    )
    expect(handlers.get('settings:get')?.(ownPage)).toBe('settings')
    expect(AFTER_TERMS.has('updates:check')).toBe(true)

    await expect(async () => handlers.get('legal:accept')?.(ownPage, false)).rejects.toThrow(/age/)
    await handlers.get('legal:accept')?.(ownPage, true)
    expect(handlers.get('assistant:ask')?.(ownPage)).toBe('answered')
  })
})

describe('settings from before consent dates', () => {
  it('keeps earlier consents, with an unknown date', async () => {
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ webLookup: true, geminiConsent: false, deviceConsent: true })
    )
    vi.resetModules()
    const fresh = await import('../src/main/system/settings')
    expect(fresh.getSettings().consents).toEqual({ lookups: '', games: '' })
  })
})
