import { useEffect, useState } from 'react'
import { shortcutFromKey } from '../../../shared/shortcuts'

// Shows a shortcut and lets the player pick a new one by pressing it. While picking, GameMate's
// shortcuts are paused, so pressing the current one doesn't open the in-game window.
function ShortcutField({
  value,
  fallback,
  other,
  onChange
}: {
  value: string
  // The original shortcut, offered as "Default".
  fallback: string
  // The other shortcut, which this one must differ from.
  other: string
  onChange: (shortcut: string) => void
}): React.JSX.Element {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!picking) return
    window.api.pauseShortcuts(true)
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setPicking(false)
        return
      }
      const result = shortcutFromKey(e)
      if ('pending' in result) return
      if ('error' in result) {
        setError(result.error)
      } else if (result.shortcut === other) {
        setError('That is already GameMate’s other shortcut.')
      } else {
        setError(null)
        onChange(result.shortcut)
        setPicking(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.api.pauseShortcuts(false)
    }
  }, [picking, other, onChange])

  return (
    <div className="shortcut-field">
      <div className="button-row">
        {picking ? (
          <kbd className="is-picking">Press the new shortcut… (Esc to cancel)</kbd>
        ) : (
          <kbd>{value}</kbd>
        )}
        {!picking && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setPicking(true)
            }}
          >
            Change
          </button>
        )}
        {!picking && value !== fallback && fallback !== other && (
          <button type="button" onClick={() => onChange(fallback)}>
            Default
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}

export default ShortcutField
