import type { WikiPicture } from '../../../preload/index.d'

// A picture from a game's wiki (GameMate already downloaded it). Clicking it opens the picture's
// page on the wiki, which credits its source.
export function Picture({
  picture,
  className = ''
}: {
  picture: WikiPicture
  className?: string
}): React.JSX.Element {
  return (
    <figure className={`picture is-${picture.kind} ${className}`}>
      <a
        href={picture.url}
        title={`Open on the ${picture.wiki}`}
        onClick={(e) => {
          e.preventDefault()
          window.api.openSource(picture.url)
        }}
      >
        <img src={picture.src} alt={picture.caption} />
      </a>
      <figcaption>
        {picture.caption} · {picture.wiki}
      </figcaption>
    </figure>
  )
}

// The maps and pictures an answer came with.
function Pictures({ pictures }: { pictures?: WikiPicture[] }): React.JSX.Element | null {
  if (!pictures?.length) return null
  return (
    <div className="pictures">
      {pictures.map((p) => (
        <Picture key={p.url} picture={p} />
      ))}
    </div>
  )
}

export default Pictures
