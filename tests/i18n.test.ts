import { describe, expect, it } from 'vitest'
import { createTranslator, flattenKeys, resources } from '../src/shared/i18n'
import { LANGUAGES, type LanguageCode } from '../src/shared/languages'

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

describe('the eleven translations', () => {
  const english = resources.en.translation
  const englishTexts = new Map(
    flattenKeys(english).map((k) => [
      k,
      k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], english)
    ])
  )
  // Texts that read the same in every language: names, units and values only.
  const SAME = /^(GameMate|Gemini|Ollama|Steam|Minecraft|Modrinth|\{\{\w+\}\}( \w+)?|[^\p{L}]*)$/u
  // Words a language writes exactly like English.
  const SAME_WORDS: Partial<Record<LanguageCode, string[]>> = {
    fr: ['⏸ Pause', 'Modpack', '✦ Auto', 'Gemini (cloud)', 'Volume', 'Observation'],
    de: ['Modpack', 'Wiki: {{wiki}}', 'Updates', '📷 Screenshot'],
    es: ['Wiki: {{wiki}}', 'Natural (Kokoro)', 'General'],
    pt: ['Wiki: {{wiki}}', 'Natural (Kokoro)', 'Volume'],
    it: ['Wiki: {{wiki}}', 'Gemini (cloud)', 'Volume', '📷 Screenshot'],
    tr: ['Model', 'Wiki: {{wiki}}'],
    ja: ['Wiki: {{wiki}}']
  }

  for (const { code } of LANGUAGES.filter((l) => l.code !== 'en')) {
    it(`cover every English text in ${code}`, () => {
      const translation = resources[code].translation
      const keys = new Set(flattenKeys(translation))
      const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories
      const missing: string[] = []
      for (const key of englishTexts.keys()) {
        if (/_one$/.test(key)) continue
        if (/_other$/.test(key)) {
          const base = key.slice(0, -'_other'.length)
          for (const c of categories) if (!keys.has(`${base}_${c}`)) missing.push(`${base}_${c}`)
        } else if (!keys.has(key)) missing.push(key)
      }
      expect(missing, `${code} is missing`).toEqual([])
    })

    it(`keeps the links and bold parts in ${code}`, () => {
      const translation = resources[code].translation
      const tags = (text: unknown): string[] =>
        typeof text === 'string' ? [...text.matchAll(/<\/?(\w+)>/g)].map((m) => m[0]).sort() : []
      const broken = flattenKeys(translation).filter((key) => {
        const text = key
          .split('.')
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], translation)
        return tags(text).join() !== tags(englishTexts.get(key)).join()
      })
      expect(broken, `${code} changed the markup`).toEqual([])
    })

    it(`translates the texts in ${code}`, () => {
      const translation = resources[code].translation
      const untranslated = flattenKeys(translation).filter((key) => {
        const text = key
          .split('.')
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], translation)
        const source = englishTexts.get(key)
        return (
          text === source && !SAME.test(String(text)) && !SAME_WORDS[code]?.includes(String(text))
        )
      })
      expect(untranslated, `${code} still in English`).toEqual([])
    })
  }
})

describe('example questions', () => {
  it('are translated for every game', async () => {
    const { MINECRAFT, savedGameProfile } = await import('../src/main/games/catalog')
    const t = createTranslator('en')
    const names = ['Valorant', 'Overwatch 2', 'Some Indie Game', 'Rocket League', 'Dota 2']
    const profiles = [
      MINECRAFT,
      ...names.map((name) => savedGameProfile({ id: name, name, launcher: 'manual' }))
    ]
    for (const profile of profiles) {
      for (const key of profile.examples) {
        expect(key, `${profile.name}: ${key}`).toMatch(/^gameExamples\./)
        expect(t(key), key).not.toBe(key)
      }
    }
  })
})

describe('the legal documents', () => {
  it('read left to right in English inside a right-to-left window', async () => {
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { LegalDocument } = await import('../src/renderer/src/legal/LegalReader')
    const html = renderToString(createElement(LegalDocument, { doc: 'terms', onDoc: () => {} }))
    expect(html).toMatch(/<article class="legal-doc" lang="en" dir="ltr">/)
  })
})

describe('the voice settings', () => {
  const en = createTranslator('en')
  it('name every natural voice', async () => {
    const { SUPERTONIC_VOICES } = await import('../src/shared/types')
    const { naturalVoiceLabel } = await import('../src/renderer/src/voice/labels')
    const labels = SUPERTONIC_VOICES.map((v) => naturalVoiceLabel(v, en))
    expect(labels.slice(0, 2)).toEqual(['Female 1', 'Female 2'])
    expect(labels.at(-1)).toBe('Male 5')
  })

  it('explain where the natural voice and Windows voices don’t cover a language', () => {
    expect(en('voicePanel.noWindowsVoice', { language: '中文' })).toBe(
      'No Windows voice speaks 中文 yet.'
    )
    expect(en('voicePanel.naturalNotForLanguage', { language: '中文' })).toContain('中文')
    expect(en('voicePanel.addWindowsVoices')).toBe('Add Windows voices')
  })
})
