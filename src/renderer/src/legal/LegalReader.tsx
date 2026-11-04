import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseMarkdown, type Inline } from './markdown'
import { docLink, legalText, type LegalDoc } from './texts'
import { t } from '../i18n'
import { isLanguageCode, languageInfo, type LanguageCode } from '../../../shared/languages'

export type { LegalDoc }

function Text({
  parts,
  onDoc
}: {
  parts: Inline[]
  onDoc: (doc: LegalDoc) => void
}): React.JSX.Element {
  return (
    <>
      {parts.map((part, i) => {
        if (part.bold) return <strong key={i}>{part.text}</strong>
        const href = part.href
        if (!href) return <span key={i}>{part.text}</span>
        return (
          <a
            key={i}
            href={href}
            onClick={(e) => {
              e.preventDefault()
              const other = docLink(href)
              if (other) onDoc(other)
              else window.api.openSource(href)
            }}
          >
            {part.text}
          </a>
        )
      })}
    </>
  )
}

export function LegalDocument({
  doc,
  onDoc,
  language = 'en'
}: {
  doc: LegalDoc
  onDoc: (doc: LegalDoc) => void
  // Where there is no translation, the English text is shown (left to right).
  language?: LanguageCode
}): React.JSX.Element {
  const shown = legalText(doc, language)
  return (
    <article className="legal-doc" lang={shown.language} dir={languageInfo(shown.language).dir}>
      {parseMarkdown(shown.text).map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
            return (
              <Tag key={i}>
                <Text parts={block.text} onDoc={onDoc} />
              </Tag>
            )
          }
          case 'paragraph':
            return (
              <p key={i}>
                <Text parts={block.text} onDoc={onDoc} />
              </p>
            )
          case 'list':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Text parts={item} onDoc={onDoc} />
                  </li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <table key={i}>
                <thead>
                  <tr>
                    {block.header.map((cell, j) => (
                      <th key={j}>
                        <Text parts={cell} onDoc={onDoc} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>
                          <Text parts={cell} onDoc={onDoc} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      })}
    </article>
  )
}

// The Terms of Use or the Privacy Policy in a window of their own.
export function LegalReader({
  doc,
  onDoc,
  onClose,
  startInEnglish = false
}: {
  doc: LegalDoc
  onDoc: (doc: LegalDoc) => void
  onClose: () => void
  // Opened from "the English version is binding".
  startInEnglish?: boolean
}): React.JSX.Element {
  const { i18n } = useTranslation()
  const language: LanguageCode = isLanguageCode(i18n.language) ? i18n.language : 'en'
  // The player can read the binding English text instead of the translation.
  const [english, setEnglish] = useState(startInEnglish)
  const translated = legalText(doc, language).language !== 'en'
  return (
    <div className="modal-backdrop is-top" onClick={onClose}>
      <div
        className="modal legal-reader"
        role="dialog"
        aria-modal="true"
        aria-label={doc === 'terms' ? t('legalReader.termsOfUse') : t('legalReader.privacyPolicy')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-tabs">
          <button
            type="button"
            className={doc === 'terms' ? 'is-active' : ''}
            onClick={() => onDoc('terms')}
          >
            {t('legalReader.termsOfUse')}
          </button>
          <button
            type="button"
            className={doc === 'privacy' ? 'is-active' : ''}
            onClick={() => onDoc('privacy')}
          >
            {t('legalReader.privacyPolicy')}
          </button>
          <button
            type="button"
            className="legal-close"
            onClick={onClose}
            aria-label={t('legalReader.close')}
          >
            ✕
          </button>
        </div>
        {translated && (
          <button
            type="button"
            className="link-button legal-english"
            onClick={() => setEnglish(!english)}
          >
            {english
              ? t('legalReader.backToTranslation', { language: languageInfo(language).nativeName })
              : t('legalReader.readEnglish')}
          </button>
        )}
        <LegalDocument doc={doc} onDoc={onDoc} language={english ? 'en' : language} />
      </div>
    </div>
  )
}
