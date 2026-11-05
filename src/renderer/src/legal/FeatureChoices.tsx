import { useEffect, useState } from 'react'
import type { Settings } from '../../../preload/index.d'
import type { FeatureChoices as Choices } from '../../../shared/types'
import { languageInfo } from '../../../shared/languages'
import { errorMessage } from '../hooks/useSettings'
import { t } from '../i18n'

type Row = keyof Choices

const NONE: Choices = {
  games: false,
  lookups: false,
  voice: false,
  naturalVoice: false,
  screenshot: false,
  tray: false
}

// Shown once after the Terms on a first start: the features that are off until the player
// turns them on, each with what it sends or downloads. Nothing is ticked beforehand.
function FeatureChoices({
  settings,
  onLater
}: {
  settings: Settings
  onLater: () => void
}): React.JSX.Element {
  const [choices, setChoices] = useState<Choices>(NONE)
  const [sizes, setSizes] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const naturalVoice = languageInfo(settings.language || 'en').naturalVoice !== false

  useEffect(() => {
    window.api.voice
      .models()
      .then((models) => setSizes(Object.fromEntries(models.map((m) => [m.id, m.sizeMb]))))
      .catch(() => {})
  }, [])

  const shown: Row[] = ['games', 'lookups', 'voice', 'naturalVoice', 'screenshot', 'tray'].filter(
    (row) => row !== 'naturalVoice' || naturalVoice
  ) as Row[]

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const row = (name: Row, label: string, help: string): React.JSX.Element => (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={choices[name]}
          onChange={(e) => setChoices({ ...choices, [name]: e.target.checked })}
        />
        {label}
      </label>
      <p className="field-help">{help}</p>
    </>
  )

  return (
    <div className="modal-backdrop">
      <div
        className="modal terms-gate feature-choices"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-choices-title"
      >
        <h2 id="feature-choices-title">{t('featureChoices.title')}</h2>
        <p className="modal-lead">{t('featureChoices.lead')}</p>
        <fieldset className="feature-group">
          <legend>{t('featureChoices.sendsData')}</legend>
          {row('games', t('featureChoices.games'), t('featureChoices.gamesHelp'))}
          {row('lookups', t('featureChoices.lookups'), t('featureChoices.lookupsHelp'))}
        </fieldset>
        {row(
          'voice',
          t('featureChoices.voice'),
          t('featureChoices.voiceHelp', { size: sizes.accurate ?? '' })
        )}
        {naturalVoice &&
          row(
            'naturalVoice',
            t('featureChoices.naturalVoice'),
            t('featureChoices.naturalVoiceHelp', { size: sizes.supertonic ?? '' })
          )}
        {row('screenshot', t('featureChoices.screenshot'), t('featureChoices.screenshotHelp'))}
        {row('tray', t('featureChoices.tray'), t('featureChoices.trayHelp'))}
        {error && <p className="error-text">{error}</p>}
        <div className="button-row modal-actions">
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() =>
              setChoices(Object.fromEntries(shown.map((r) => [r, true])) as unknown as Choices)
            }
          >
            {t('featureChoices.tickAll')}
          </button>
          <span className="spacer" />
          <button type="button" disabled={busy} onClick={onLater}>
            {t('featureChoices.later')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => window.api.updateSettings({ featureChoices: 'answered' }))}
          >
            {t('featureChoices.never')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              run(() =>
                shown.some((r) => choices[r])
                  ? window.api.features.apply(choices)
                  : window.api.updateSettings({ featureChoices: 'answered' })
              )
            }
          >
            {t('featureChoices.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default FeatureChoices
