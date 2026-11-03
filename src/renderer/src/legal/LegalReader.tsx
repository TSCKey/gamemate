import termsText from '../../../../docs/TERMS.md?raw'
import privacyText from '../../../../docs/PRIVACY.md?raw'
import { parseMarkdown, type Block, type Inline } from './markdown'
import { t } from '../i18n'

// The same documents as in the repository, built into the app so they can be read offline.
export type LegalDoc = 'terms' | 'privacy'

const DOCS: Record<LegalDoc, Block[]> = {
  terms: parseMarkdown(termsText),
  privacy: parseMarkdown(privacyText)
}

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
              // Links between the two documents stay in the reader.
              if (href.endsWith('TERMS.md')) onDoc('terms')
              else if (href.endsWith('PRIVACY.md')) onDoc('privacy')
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
  onDoc
}: {
  doc: LegalDoc
  onDoc: (doc: LegalDoc) => void
}): React.JSX.Element {
  return (
    // The documents are in English for now: left to right also in an Arabic window.
    <article className="legal-doc" lang="en" dir="ltr">
      {DOCS[doc].map((block, i) => {
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
  onClose
}: {
  doc: LegalDoc
  onDoc: (doc: LegalDoc) => void
  onClose: () => void
}): React.JSX.Element {
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
        <LegalDocument doc={doc} onDoc={onDoc} />
      </div>
    </div>
  )
}
