// The Terms of Use and Privacy Policy in every language they are translated into, built into the
// app so they can be read offline: docs/TERMS.md and docs/PRIVACY.md in English (binding), and
// docs/<language>/TERMS.md and PRIVACY.md for the translations.
import termsText from '../../../../docs/TERMS.md?raw'
import privacyText from '../../../../docs/PRIVACY.md?raw'
import type { LanguageCode } from '../../../shared/languages'

export type LegalDoc = 'terms' | 'privacy'

const ENGLISH: Record<LegalDoc, string> = { terms: termsText, privacy: privacyText }
const FILE: Record<LegalDoc, string> = { terms: 'TERMS.md', privacy: 'PRIVACY.md' }

const BUNDLED: Record<string, string> = import.meta.glob('../../../../docs/*/{TERMS,PRIVACY}.md', {
  query: '?raw',
  import: 'default',
  eager: true
})

// The document in the language, or in English when there is no translation.
export function legalText(
  doc: LegalDoc,
  language: LanguageCode,
  files: Record<string, string> = BUNDLED
): { text: string; language: LanguageCode } {
  const translated =
    language === 'en' ? undefined : files[`../../../../docs/${language}/${FILE[doc]}`]
  return translated ? { text: translated, language } : { text: ENGLISH[doc], language: 'en' }
}

// Links between the documents stay in the reader. In a translation, "../TERMS.md" (the note at
// the top) is the binding English text.
export function docLink(href: string): { doc: LegalDoc; english: boolean } | null {
  const match = /^(\.\.\/)?(TERMS|PRIVACY)\.md$/.exec(href)
  if (!match) return null
  return { doc: match[2] === 'TERMS' ? 'terms' : 'privacy', english: !!match[1] }
}
