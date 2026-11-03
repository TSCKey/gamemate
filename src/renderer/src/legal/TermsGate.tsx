import { useState } from 'react'
import type { Settings } from '../../../preload/index.d'
import { PrivacySummary } from '../components/PrivacyPanel'
import { errorMessage } from '../hooks/useSettings'
import { LegalReader, type LegalDoc } from './LegalReader'
import { Trans } from 'react-i18next'
import { t } from '../i18n'

// Shown until the player accepts the current Terms of Use: on first start, after the terms
// change, and after the player withdrew their acceptance. GameMate can't be used until then.
function TermsGate({ settings }: { settings: Settings }): React.JSX.Element {
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [reading, setReading] = useState<LegalDoc | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Accepted an earlier version before.
  const changed = settings.termsVersion > 0

  const accept = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.legal.accept(ageConfirmed)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const link = (doc: LegalDoc): React.JSX.Element => (
    <button type="button" className="link-button" onClick={() => setReading(doc)} />
  )

  return (
    <>
      <div className="modal-backdrop">
        <div
          className="modal terms-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-title"
        >
          <h2 id="terms-title">
            {changed ? t('termsGate.ourTermsHaveChanged') : t('termsGate.welcomeToGamemate')}
          </h2>
          <p className="modal-lead">
            {changed ? t('termsGate.pleaseReadAndAcceptThe') : t('termsGate.beforeYouStartHereIs')}
          </p>
          <PrivacySummary />
          <p className="terms-read">
            <Trans
              i18nKey="termsGate.pleaseReadTheFull"
              components={{ terms: link('terms'), privacy: link('privacy') }}
            />
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
            />
            {t('termsGate.iAm16OrOlder')}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            {t('termsGate.iAcceptTheTerms')}
          </label>
          <p className="field-help">{t('termsGate.featuresThatSendDataTo')}</p>
          {error && <p className="error-text">{error}</p>}
          <div className="button-row modal-actions">
            {deleting ? (
              <>
                <span className="terms-delete-ask">
                  {t('termsGate.deleteEverythingGamemateStored')}
                </span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => window.api.deleteData().then(() => setDeleting(false))}
                >
                  {t('termsGate.delete')}
                </button>
                <button type="button" onClick={() => setDeleting(false)}>
                  {t('termsGate.cancel')}
                </button>
              </>
            ) : (
              <button type="button" className="link-button" onClick={() => setDeleting(true)}>
                {t('termsGate.deleteMyData')}
              </button>
            )}
            <span className="spacer" />
            <button type="button" onClick={() => window.api.quit()}>
              {t('termsGate.quitGamemate')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ageConfirmed || !accepted}
              onClick={accept}
            >
              {t('termsGate.acceptAndContinue')}
            </button>
          </div>
        </div>
      </div>
      {reading && <LegalReader doc={reading} onDoc={setReading} onClose={() => setReading(null)} />}
    </>
  )
}

export default TermsGate
