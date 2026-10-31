import { PrivacySummary } from './PrivacyPanel'

// Shown once on first start (and again if the notice changes).
function PrivacyNotice({
  onAccept,
  onMore
}: {
  onAccept: () => void
  onMore: () => void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Before you start</h2>
        <p className="modal-lead">Here is what GameMate does with your data.</p>
        <PrivacySummary />
        <p className="field-help">
          You can change any of this and delete your data any time in Settings → Privacy.
        </p>
        <div className="button-row modal-actions">
          <button type="button" onClick={onMore}>
            Privacy settings
          </button>
          <button type="button" className="primary" onClick={onAccept}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default PrivacyNotice
