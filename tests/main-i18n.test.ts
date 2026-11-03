import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

// The main process's messages in the player's language, without Electron: a temporary data
// folder, a stand-in AI and a small German translation.
const userData = mkdtempSync(join(tmpdir(), 'gamemate-main-i18n-'))
// What the main process sends to the windows.
const sent = vi.hoisted(() => [] as { channel: string; data: unknown }[])
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: {
    getAllWindows: () => [
      { webContents: { send: (channel: string, data: unknown) => sent.push({ channel, data }) } }
    ]
  },
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
    errors: { gemini: { unreachable: 'Gemini ist nicht erreichbar.' } },
    models: { local: { fast: 'Schnell' } }
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

describe('errors from the main process', () => {
  it('reach the player without the error class name', async () => {
    const { UnreachableError } = await import('../src/main/ai/errors')
    const thrown = new UnreachableError('Gemini took too long to respond.')
    // Electron sends a rejected request's error as its toString().
    expect(errorMessage(new Error(`Error invoking remote method 'assistant:ask': ${thrown}`))).toBe(
      'Gemini took too long to respond.'
    )
    expect(isUnreachable(thrown)).toBe(true)
  })
})

describe('the built-in models', () => {
  it('are shown again in the new language when it changes', async () => {
    const { followLanguage } = await import('../src/main/ai/localModels')
    updateSettings({ language: 'en' })
    followLanguage()
    sent.length = 0
    updateSettings({ language: 'de' })
    const update = sent.filter((m) => m.channel === 'local-models:changed').at(-1)
    const models = update?.data as { id: string; label: string }[] | undefined
    expect(models?.find((m) => m.id === 'qwen3.5-2b')?.label).toBe('Schnell')
  })
})
