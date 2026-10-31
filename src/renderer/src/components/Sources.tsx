import type { WikiSource } from '../../../preload/index.d'

// Links to the minecraft.wiki pages an answer used (the wiki's license asks for attribution).
function Sources({ sources }: { sources?: WikiSource[] }): React.JSX.Element | null {
  if (!sources?.length) return null
  return (
    <div className="sources">
      Source:{' '}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ', '}
          <a
            href={s.url}
            onClick={(e) => {
              e.preventDefault()
              window.api.openSource(s.url)
            }}
          >
            {s.title}
          </a>
        </span>
      ))}{' '}
      (minecraft.wiki, CC BY-NC-SA 3.0)
    </div>
  )
}

export default Sources
