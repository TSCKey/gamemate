import type { WikiSource } from '../../../preload/index.d'
import { t } from '../i18n'

// Links to the wiki and mod pages an answer used, with each site's license (wiki texts are
// shared under licenses that ask for attribution).
function Sources({ sources }: { sources?: WikiSource[] }): React.JSX.Element | null {
  if (!sources?.length) return null
  return (
    <div className="sources">
      {t('sources.source')}{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <a
            href={s.url}
            onClick={(e) => {
              e.preventDefault()
              window.api.openSource(s.url)
            }}
          >
            {s.title}
          </a>{' '}
          ({s.wiki}
          {s.license ? `, ${s.license}` : ''})
        </span>
      ))}
    </div>
  )
}

export default Sources
