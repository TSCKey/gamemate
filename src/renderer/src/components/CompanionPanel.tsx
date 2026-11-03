import { useEffect, useState } from 'react'
import type { CommentaryFrequency, CompanionState, Settings } from '../../../preload/index.d'
import { COMMENTARY_FREQUENCIES, COMPANION_MODES, statusText } from '../constants'
import { Field, Section } from './ui'
import { t } from '../i18n'

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
  if (seconds < 60) return t('companionPanel.justNow')
  const minutes = Math.round(seconds / 60)
  return minutes < 60
    ? t('companionPanel.minAgo', { minutes })
    : t('companionPanel.hAgo', { value: Math.round(minutes / 60) })
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
        title={t('companionPanel.companionMode')}
        description={t('companionPanel.howMuchGamemateWatchesYour')}
      >
        <div className="mode-grid" role="radiogroup" aria-label={t('companionPanel.companionMode')}>
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
          <Field label={t('companionPanel.howOftenToComment')}>
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
                <span className="companion-dot" /> {statusText(state.status)}
                {state.game && state.status !== 'waiting-for-game' ? ` · ${state.game}` : ''}
              </span>
            }
          >
            <button type="button" onClick={() => window.api.companion.setPaused(!state.paused)}>
              {state.paused ? t('companionPanel.resume') : t('companionPanel.pause')}
            </button>
          </Field>
        )}
      </Section>

      {showLog && (
        <Section
          title={t('companionPanel.whatGamemateSaw')}
          description={t('companionPanel.keptOnlyWhileGamemateIs')}
        >
          {state && state.events.length > 0 ? (
            <ul className="companion-log">
              {[...state.events].reverse().map((e) => (
                <li key={e.time}>
                  <span>{EVENT_ICONS[e.type]}</span>
                  <span className="companion-log-text" dir="auto">
                    {e.spoken && e.comment ? `“${e.comment}”` : e.description}
                  </span>
                  <span className="companion-log-time">{timeAgo(e.time)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">{t('companionPanel.nothingYetStartPlayingAnd')}</p>
          )}
        </Section>
      )}
    </>
  )
}

export default CompanionPanel
