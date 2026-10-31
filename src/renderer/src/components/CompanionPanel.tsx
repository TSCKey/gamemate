import { useEffect, useState } from 'react'
import type {
  CommentaryFrequency,
  CompanionMode,
  CompanionState,
  Settings
} from '../../../preload/index.d'

const MODES: { value: CompanionMode; label: string; help: string }[] = [
  {
    value: 'disabled',
    label: 'Disabled',
    help: 'GameMate never looks at your screen, not even when you press the shortcut.'
  },
  { value: 'on-demand', label: 'On-demand', help: 'GameMate only looks and answers when you ask.' },
  {
    value: 'observation',
    label: 'Observation',
    help: 'GameMate watches your game and keeps a log of what happens below, without pop-ups.'
  },
  {
    value: 'commentary',
    label: 'Commentary',
    help: 'GameMate watches your game and pops up a short comment when something important happens.'
  },
  {
    value: 'quiet',
    label: 'Quiet',
    help: 'GameMate watches your game silently and uses what it saw only to answer your questions.'
  }
]

const FREQUENCIES: { value: CommentaryFrequency; label: string }[] = [
  { value: 'rare', label: 'Rarely (big moments only)' },
  { value: 'normal', label: 'Sometimes' },
  { value: 'frequent', label: 'Often' }
]

const STATUS_TEXT: Record<CompanionState['status'], string> = {
  off: 'Not watching',
  paused: 'Paused',
  'no-model': 'Pick a model to start watching',
  'waiting-for-game': 'Waiting for Minecraft to be the active window',
  watching: 'Watching',
  analyzing: 'Looking at your screen…'
}

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

  const mode = MODES.find((m) => m.value === settings.companionMode) ?? MODES[1]
  const watching = state !== null && state.status !== 'off'
  const showLog =
    settings.companionMode === 'observation' || settings.companionMode === 'commentary'

  return (
    <section className="companion">
      <div className="companion-row">
        <label>
          Mode
          <select
            value={settings.companionMode}
            onChange={(e) => update({ companionMode: e.target.value as CompanionMode })}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {settings.companionMode === 'commentary' && (
          <label>
            Comments
            <select
              value={settings.commentaryFrequency}
              onChange={(e) =>
                update({ commentaryFrequency: e.target.value as CommentaryFrequency })
              }
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {watching && (
          <button type="button" onClick={() => window.api.companion.setPaused(!state.paused)}>
            {state.paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
      </div>
      <p className="companion-help">{mode.help}</p>
      {watching && (
        <p className={`companion-status is-${state.status}`}>
          <span className="companion-dot" /> {STATUS_TEXT[state.status]}
          {state.game && state.status !== 'waiting-for-game' ? ` · ${state.game}` : ''}
        </p>
      )}
      {showLog && state && state.events.length > 0 && (
        <ul className="companion-log">
          {[...state.events].reverse().map((e) => (
            <li key={e.time}>
              <span className="companion-log-icon">{EVENT_ICONS[e.type]}</span>
              <span className="companion-log-text">
                {e.spoken && e.comment ? `“${e.comment}”` : e.description}
              </span>
              <span className="companion-log-time">{timeAgo(e.time)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default CompanionPanel
