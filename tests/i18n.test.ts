import { describe, expect, it } from 'vitest'
import { createTranslator, flattenKeys, resources } from '../src/shared/i18n'
import { LANGUAGES } from '../src/shared/languages'

// Small stand-in translations, so these tests don't depend on the real texts.
const stub = {
  en: { translation: { chat: { send: 'Send', newChat: 'New chat' }, x: { hello: 'Hi {{game}}' } } },
  de: { translation: { chat: { send: 'Senden' } } }
}

describe('translating', () => {
  it('uses the language, and English where a text is missing', () => {
    const t = createTranslator('de', stub)
    expect(t('chat.send')).toBe('Senden')
    expect(t('chat.newChat')).toBe('New chat')
  })

  it('fills in placeholders', () => {
    expect(createTranslator('en', stub)('x.hello', { game: 'Overwatch' })).toBe('Hi Overwatch')
  })
})

describe('translation files', () => {
  const english = resources.en.translation as Record<string, unknown>
  const englishKeys = new Set(flattenKeys(english))
  const valueAt = (obj: unknown, key: string): unknown =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj)
  const placeholders = (text: unknown): string[] =>
    typeof text === 'string' ? [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]) : []

  it('exist for every language', () => {
    for (const { code } of LANGUAGES) expect(resources[code]?.translation).toBeTypeOf('object')
  })

  it('only use keys that English has, with the same placeholders', () => {
    for (const { code } of LANGUAGES) {
      const translation = resources[code].translation
      for (const key of flattenKeys(translation)) {
        expect(
          englishKeys.has(key.replace(/_(zero|one|two|few|many|other)$/, '_other')) ||
            englishKeys.has(key),
          `${code}: ${key}`
        ).toBe(true)
        const source =
          valueAt(english, key) ??
          valueAt(english, key.replace(/_(zero|one|two|few|many)$/, '_other'))
        for (const name of placeholders(valueAt(translation, key))) {
          expect(placeholders(source), `${code}: ${key} uses {{${name}}}`).toContain(name)
        }
      }
    }
  })
})

describe('the windows', () => {
  it('switch the page language and writing direction', async () => {
    const page = { documentElement: {} as { lang?: string; dir?: string } }
    Object.assign(globalThis, { document: page })
    const { applyLanguage } = await import('../src/renderer/src/i18n')
    applyLanguage('ar')
    expect(page.documentElement).toEqual({ lang: 'ar', dir: 'rtl' })
    applyLanguage('de')
    expect(page.documentElement).toEqual({ lang: 'de', dir: 'ltr' })
    applyLanguage('en')
  })

  it('show chat text in its own direction', async () => {
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { setupI18n } = await import('../src/renderer/src/i18n')
    const { default: ChatBubble } = await import('../src/renderer/src/components/ChatBubble')
    setupI18n()
    const html = renderToString(
      createElement(ChatBubble, {
        message: { role: 'assistant', content: 'مرحبا' },
        onAuto: false
      })
    )
    expect(html).toMatch(/<div[^>]*dir="auto"[^>]*>مرحبا<\/div>/)
  })
})
