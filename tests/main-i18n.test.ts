import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

// The main process's messages in the player's language, without Electron: a temporary data
// folder, a stand-in AI and a small German translation.
const userData = mkdtempSync(join(tmpdir(), 'gamemate-main-i18n-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {},
  screen: {},
  desktopCapturer: {}
}))
vi.mock('koffi', () => ({ default: {} }))
vi.mock('../src/main/ai/llm', () => ({
  complete: async () => ({ content: 'web_search("Silksong Last Judge tips")', toolCalls: [] })
}))
vi.mock('../src/shared/i18n/de.json', () => ({
  default: {
    answers: { noAnswer: 'Dazu habe ich keine passende Antwort gefunden.' },
    errors: { gemini: { unreachable: 'Gemini ist nicht erreichbar.' } }
  }
}))

const { updateSettings } = await import('../src/main/system/settings')
const { t } = await import('../src/main/system/i18n')
const { ask } = await import('../src/main/ai/assistant')
const { errorMessage } = await import('../src/renderer/src/hooks/useSettings')
const { resources } = await import('../src/shared/i18n')
const { isUnreachable } = await import('../src/main/ai/engines')
const { listGeminiModels } = await import('../src/main/ai/gemini')

const english = resources.en.translation as { errors: { terms: { notAccepted: string } } }

describe('main process messages', () => {
  it('say there is no answer in the player’s language', async () => {
    updateSettings({ language: 'de' })
    const reply = await ask(
      {
        engine: { provider: 'builtin', model: 'test' },
        game: { name: 'Silksong' },
        webLookup: false
      },
      [{ role: 'user', content: 'Wie besiege ich den Letzten Richter?' }]
    )
    expect(reply.content).toBe('Dazu habe ich keine passende Antwort gefunden.')
  })

  it('fall back to English where a language lacks a text', () => {
    updateSettings({ language: 'de' })
    expect(t('errors.terms.notAccepted')).toBe(english.errors.terms.notAccepted)
    expect(english.errors.terms.notAccepted).toMatch(/\w/)
  })

  it('reach the player without Electron’s prefix', () => {
    const text = 'Bitte zuerst die Nutzungsbedingungen akzeptieren.'
    expect(
      errorMessage(new Error(`Error invoking remote method 'assistant:ask': Error: ${text}`))
    ).toBe(text)
  })

  it('still let Auto mode switch AI when the error is translated', async () => {
    updateSettings({ language: 'de' })
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network down')
    })
    const error = await listGeminiModels('key').catch((e: unknown) => e)
    vi.unstubAllGlobals()
    expect((error as Error).message).toBe('Gemini ist nicht erreichbar.')
    expect(isUnreachable(error)).toBe(true)
  })
})
