import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { docLink, legalText } from '../src/renderer/src/legal/texts'
import { LegalDocument } from '../src/renderer/src/legal/LegalReader'
import { parseMarkdown } from '../src/renderer/src/legal/markdown'
import { flat, SUPERTONIC_RESTRICTIONS } from './helpers/supertonic'

const english = (name: string): string => readFileSync(join(__dirname, '..', 'docs', name), 'utf8')
const render = (language: 'de' | 'en' | 'ar'): string =>
  renderToString(createElement(LegalDocument, { doc: 'terms', language, onDoc: () => {} }))

describe('the legal documents in the player’s language', () => {
  it('open in German, starting with the note that English is binding', () => {
    const terms = legalText('terms', 'de')
    expect(terms.language).toBe('de')
    const firstParagraph = terms.text.split('\n\n')[1]
    expect(firstParagraph).toContain('](../TERMS.md)')
    expect(legalText('privacy', 'de').text.split('\n\n')[1]).toContain('](../PRIVACY.md)')
  })

  it('are in English where there is no translation', () => {
    expect(legalText('terms', 'zh', {})).toEqual({ text: english('TERMS.md'), language: 'en' })
    expect(legalText('privacy', 'en')).toEqual({ text: english('PRIVACY.md'), language: 'en' })
  })

  it('read in the direction of their language', () => {
    expect(render('de')).toMatch(/<article class="legal-doc" lang="de" dir="ltr">/)
    expect(render('en')).toMatch(/<article class="legal-doc" lang="en" dir="ltr">/)
  })

  it('keep links between the two documents inside the reader', () => {
    expect(docLink('PRIVACY.md')).toBe('privacy')
    expect(docLink('../TERMS.md')).toBe('terms')
    expect(docLink('../PRIVACY.md')).toBe('privacy')
    expect(docLink('https://ai.google.dev/gemini-api/terms')).toBeNull()
  })
})

// Every translation has the English text's sections, links and email addresses, the note that
// English is binding, and the Supertonic voice's use restrictions word for word.
const TRANSLATED = ['ar', 'fr', 'de', 'es', 'pt', 'it', 'tr', 'ru', 'ja', 'zh', 'ko'] as const
const headings = (text: string): number => text.match(/^## /gm)?.length ?? 0
const links = (text: string): string[] =>
  [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((href) => !/(^|\/)(TERMS|PRIVACY)\.md$/.test(href))
    .sort()

describe.each(TRANSLATED)('the %s legal texts', (code) => {
  for (const [doc, file] of [
    ['terms', 'TERMS.md'],
    ['privacy', 'PRIVACY.md']
  ] as const) {
    it(`translate ${file} completely`, () => {
      const shown = legalText(doc, code)
      expect(shown.language).toBe(code)
      const text = shown.text
      expect(text.split('\n\n')[1]).toContain(`](../${file})`)
      expect(headings(text)).toBe(headings(english(file)))
      expect(links(text)).toEqual(links(english(file)))
      expect(text).toMatch(/^.*2.*·/m)
      const shownText = JSON.stringify(parseMarkdown(text))
      expect(shownText).not.toContain('**')
      expect(shownText).not.toContain('](')
      if (doc === 'terms') {
        for (const restriction of SUPERTONIC_RESTRICTIONS) expect(flat(text)).toContain(restriction)
      }
    })
  }
})

describe('the Arabic legal texts', () => {
  it('read right to left', () => {
    expect(render('ar')).toMatch(/<article class="legal-doc" lang="ar" dir="rtl">/)
  })
})

describe('English quoted in the Arabic Terms', () => {
  it('reads left to right, while Arabic lines stay right to left', () => {
    const html = render('ar')
    expect(html).toContain('<li dir="ltr"><span>(a) In any way that violates')
    // An Arabic paragraph that starts with a Latin name keeps the document's direction.
    expect(html).toMatch(/<p><span>GameMate تطبيق سطح مكتب/)
  })
})
