import { useEffect, useState } from 'react'
import type { CommentaryFrequency, CompanionState, Settings } from '../../../preload/index.d'
import { COMMENTARY_FREQUENCIES, COMPANION_MODES, STATUS_TEXT } from '../constants'
import { Field, Section } from './ui'

const EVENT_ICONS: Record<CompanionState['events'][number]['type'], string> = {
  hostile_mob: '⚔️',
  low_health: '❤️',
  death: '💀',
  dark_area: '🌑',
  discovery: '✨',
  other: '👀'
}

function timeAgo(time: number): string {
  const seconds = Math.round((Date.now() - time) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`
}

function CompanionPanel({
  settings,
  update
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [state, setState] = useState<CompanionState | null>(null)

  useEffect(() => {
    window.api.companion.getState().then(setState)
    return window.api.companion.onState(setState)
  }, [])

  const watching = state !== null && state.status !== 'off'
  const showLog =
    settings.companionMode === 'observation' || settings.companionMode === 'commentary'

  return (
    <>
      <Section
        title="Companion mode"
        description="How much GameMate watches your game and talks on its own."
      >
        <div className="mode-grid" role="radiogroup" aria-label="Companion mode">
          {COMPANION_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={settings.companionMode === m.value}
              className={`mode-option${settings.companionMode === m.value ? ' is-selected' : ''}`}
              onClick={() => update({ companionMode: m.value })}
            >
              <span className="mode-title">{m.label}</span>
              <span className="mode-help">{m.help}</span>
            </button>
          ))}
        </div>
        {settings.companionMode === 'commentary' && (
          <Field label="How often to comment">
            <select
              value={settings.commentaryFrequency}
              onChange={(e) =>
                update({ commentaryFrequency: e.target.value as CommentaryFrequency })
              }
            >
              {COMMENTARY_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {watching && (
          <Field
            label={
              <span className={`companion-status is-${state.status}`}>
                <span className="companion-dot" /> {STATUS_TEXT[state.status]}
                {state.game && state.status !== 'waiting-for-game' ? ` · ${state.game}` : ''}
              </span>
            }
          >
            <button type="button" onClick={() => window.api.companion.setPaused(!state.paused)}>
              {state.paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          </Field>
        )}
      </Section>

      {showLog && (
        <Section title="What GameMate saw" description="Kept only while GameMate is open.">
          {state && state.events.length > 0 ? (
            <ul className="companion-log">
              {[...state.events].reverse().map((e) => (
                <li key={e.time}>
                  <span>{EVENT_ICONS[e.type]}</span>
                  <span className="companion-log-text">
                    {e.spoken && e.comment ? `“${e.comment}”` : e.description}
                  </span>
                  <span className="companion-log-time">{timeAgo(e.time)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">
              Nothing yet. Start playing and GameMate will log what happens.
            </p>
          )}
        </Section>
      )}
    </>
  )
}

export default CompanionPanel
