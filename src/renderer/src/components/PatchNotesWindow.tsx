// "What's new in GameMate": the patch notes, shown once after an update and from Settings →
// General. The notes are GameMate's own Markdown (src/shared/patchNotes), turned into React
// elements, never HTML.
import { useTranslation } from 'react-i18next'
import { parseMarkdown, type Inline } from '../legal/markdown'
import type { PatchNotes } from '../patchNotes'
import { t } from '../i18n'
import { isLanguageCode, languageInfo } from '../../../shared/languages'

function Text({ parts }: { parts: Inline[] }): React.JSX.Element {
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
              window.api.openSource(href)
            }}
          >
            {part.text}
          </a>
        )
      })}
    </>
  )
}

function Notes({ markdown }: { markdown: string }): React.JSX.Element {
  return (
    <>
      {parseMarkdown(markdown).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <h4 key={i}>
                <Text parts={block.text} />
              </h4>
            )
          case 'paragraph':
            return (
              <p key={i}>
                <Text parts={block.text} />
              </p>
            )
          case 'list':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Text parts={item} />
                  </li>
                ))}
              </ul>
            )
          default:
            return null
        }
      })}
    </>
  )
}

export function PatchNotesWindow({
  notes,
  onClose
}: {
  // Newest first.
  notes: PatchNotes[]
  onClose: () => void
}): React.JSX.Element {
  const { i18n } = useTranslation()
  const language = isLanguageCode(i18n.language) ? i18n.language : 'en'
  const title = t('patchNotes.title', { version: notes[0]?.version ?? '' })
  return (
    <div className="modal-backdrop is-top" onClick={onClose}>
      <div
        className="modal legal-reader patch-notes"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <article className="legal-doc" lang={language} dir={languageInfo(language).dir}>
          <h2>{title}</h2>
          {notes.map((n) => (
            <section key={n.version}>
              {notes.length > 1 && <h3>{`GameMate ${n.version}`}</h3>}
              <Notes markdown={n.markdown} />
            </section>
          ))}
        </article>
        <div className="patch-notes-actions">
          <button type="button" className="primary" onClick={onClose}>
            {t('legalReader.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
