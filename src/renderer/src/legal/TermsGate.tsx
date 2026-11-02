import { useState } from 'react'
import type { Settings } from '../../../preload/index.d'
import { PrivacySummary } from '../components/PrivacyPanel'
import { errorMessage } from '../hooks/useSettings'
import { LegalReader, type LegalDoc } from './LegalReader'

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

  const link = (doc: LegalDoc, label: string): React.JSX.Element => (
    <button type="button" className="link-button" onClick={() => setReading(doc)}>
      {label}
    </button>
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
          <h2 id="terms-title">{changed ? 'Our terms have changed' : 'Welcome to GameMate'}</h2>
          <p className="modal-lead">
            {changed
              ? 'Please read and accept the updated Terms of Use to keep using GameMate.'
              : 'Before you start, here is how GameMate handles your data.'}
          </p>
          <PrivacySummary />
          <p className="terms-read">
            Please read the full {link('terms', 'Terms of Use')} and{' '}
            {link('privacy', 'Privacy Policy')}.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
            />
            I am 16 or older, or my parent or guardian agrees to my using GameMate.
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I accept the Terms of Use and have read the Privacy Policy.
          </label>
          <p className="field-help">
            Features that send data to other services stay off until you turn them on. You can
            withdraw your acceptance any time in Settings → Privacy &amp; legal.
          </p>
          {error && <p className="error-text">{error}</p>}
          <div className="button-row modal-actions">
            {deleting ? (
              <>
                <span className="terms-delete-ask">Delete everything GameMate stored?</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => window.api.deleteData().then(() => setDeleting(false))}
                >
                  Delete
                </button>
                <button type="button" onClick={() => setDeleting(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="link-button" onClick={() => setDeleting(true)}>
                Delete my data
              </button>
            )}
            <span className="spacer" />
            <button type="button" onClick={() => window.api.quit()}>
              Quit GameMate
            </button>
            <button
              type="button"
              className="primary"
              disabled={!ageConfirmed || !accepted}
              onClick={accept}
            >
              Accept and continue
            </button>
          </div>
        </div>
      </div>
      {reading && <LegalReader doc={reading} onDoc={setReading} onClose={() => setReading(null)} />}
    </>
  )
}

export default TermsGate
