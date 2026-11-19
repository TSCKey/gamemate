import { useEffect, useState } from 'react'
import type {
  CommentaryFrequency,
  CommentaryHumor,
  CompanionState,
  ReactionIntensity,
  Settings
} from '../../../preload/index.d'
import {
  COMMENT_DELIVERIES,
  COMMENTARY_CATEGORIES,
  COMMENTARY_FREQUENCIES,
  COMMENTARY_HUMOR_LEVELS,
  COMPANION_MODES,
  REACTION_INTENSITIES,
  statusText,
  type CommentDelivery
} from '../constants'
import { Field, Section, Toggle } from './ui'
import { t } from '../i18n'

const EVENT_ICONS: Record<CompanionState['events'][number]['type'], string> = {
  hostile_mob: '⚔️',
  low_health: '❤️',
  death: '💀',
  dark_area: '🌑',
  discovery: '✨',
  other: '👀',
  kill: '🎯',
  assist: '🤝',
  headshot: '🎯',
  multikill: '🔥',
  kill_streak: '🔥',
  fight_won: '🏅',
  clutch: '🌟',
  ace: '🂡',
  last_alive: '🫵',
  clutch_lost: '💀',
  recovery: '💪',
  teammate_saved: '🛟',
  team_wipe: '🤝',
  objective_won: '🚩',
  objective_lost: '🏳️',
  objective_contested: '⚠️',
  bomb_planted: '💣',
  bomb_defused: '✂️',
  round_won: '✅',
  round_lost: '❌',
  match_point: '❗',
  comeback: '🚀',
  win_streak: '📈',
  loss_streak: '📉',
  victory: '🏆',
  boss_encounter: '👑',
  area_entered: '🗺️',
  close_call_survived: '😮‍💨',
  new_area_after_deaths: '🧭',
  defeat: '🫡',
  milestone: '🎉'
}

function deliveryOf(settings: Settings): CommentDelivery {
  if (!settings.speakComments) return 'text'
  return settings.showComments ? 'both' : 'voice'
}

const DELIVERY_SETTINGS: Record<CommentDelivery, Partial<Settings>> = {
  text: { showComments: true, speakComments: false },
  voice: { showComments: false, speakComments: true },
  both: { showComments: true, speakComments: true }
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
        {settings.companionMode === 'commentary' && (
          <>
            <Field label={t('companionPanel.reactionIntensity')}>
              <select
                value={settings.commentaryIntensity}
                onChange={(e) =>
                  update({ commentaryIntensity: e.target.value as ReactionIntensity })
                }
              >
                {REACTION_INTENSITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('companionPanel.humorLevel')}>
              <select
                value={settings.commentaryHumor}
                onChange={(e) => update({ commentaryHumor: e.target.value as CommentaryHumor })}
              >
                {COMMENTARY_HUMOR_LEVELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('companionPanel.showReactionsAs')}>
              <select
                value={deliveryOf(settings)}
                onChange={(e) => update(DELIVERY_SETTINGS[e.target.value as CommentDelivery])}
              >
                {COMMENT_DELIVERIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t('companionPanel.tacticalComments')}
              help={t('companionPanel.tacticalCommentsHelp')}
            >
              <Toggle
                label={t('companionPanel.tacticalComments')}
                checked={settings.commentaryTactics}
                onChange={(commentaryTactics) => update({ commentaryTactics })}
              />
            </Field>
            <Field
              label={t('companionPanel.playerNames')}
              help={t('companionPanel.playerNamesHelp')}
            >
              <input
                type="text"
                maxLength={120}
                aria-label={t('companionPanel.playerNames')}
                defaultValue={settings.commentaryPlayerNames}
                onBlur={(e) => update({ commentaryPlayerNames: e.target.value })}
              />
            </Field>
          </>
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

      {settings.companionMode === 'commentary' && (
        <Section
          title={t('companionPanel.whatToReactTo')}
          description={t('companionPanel.whatToReactToHelp')}
        >
          {COMMENTARY_CATEGORIES.map((category) => (
            <Field key={category.value} label={category.label}>
              <Toggle
                label={category.label}
                checked={settings.commentaryCategories[category.value]}
                onChange={(on) =>
                  update({
                    commentaryCategories: {
                      ...settings.commentaryCategories,
                      [category.value]: on
                    }
                  })
                }
              />
            </Field>
          ))}
        </Section>
      )}

      {showLog && (
        <Section
          title={t('companionPanel.whatGamemateSaw')}
          description={t('companionPanel.keptOnlyWhileGamemateIs')}
        >
          {state && state.events.length > 0 ? (
            <ul className="companion-log">
              {[...state.events].reverse().map((e) => (
                <li key={e.id}>
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
