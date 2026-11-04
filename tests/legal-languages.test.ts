import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { docLink, legalText } from '../src/renderer/src/legal/texts'
import { LegalDocument } from '../src/renderer/src/legal/LegalReader'

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
