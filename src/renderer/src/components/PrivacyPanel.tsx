import { useState } from 'react'
import { LINKS } from '../constants'
import { ExternalLink, Section } from './ui'

// What GameMate does with data, in plain words. Shown on first start and in Settings → Privacy.
export function PrivacySummary(): React.JSX.Element {
  return (
    <ul className="privacy-list">
      <li>
        <strong>Runs on your PC.</strong> No account, no ads, no analytics. The GameMate developers
        receive nothing from you.
      </li>
      <li>
        <strong>Your screen</strong> is only captured when you ask, or while the companion is set to
        watch your game. Screenshots stay in memory and are never saved to disk.
      </li>
      <li>
        <strong>Your microphone</strong> is only used when voice input is on and you press the voice
        shortcut or 🎤. Speech is turned into text on this PC.
      </li>
      <li>
        <strong>Chats and the companion log</strong> are kept only while GameMate is open.
      </li>
      <li>
        <strong>Online features are off until you turn them on:</strong> looking things up on
        minecraft.wiki (only the topic is sent) and Google Gemini (your questions and screenshots
        are sent to Google). Downloading a speech model fetches it once from Hugging Face.
      </li>
    </ul>
  )
}

function PrivacyPanel(): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const deleteData = async (): Promise<void> => {
    await window.api.deleteData()
    setConfirming(false)
    setDeleted(true)
  }

  return (
    <>
      <Section title="How GameMate handles your data">
        <PrivacySummary />
      </Section>

      <Section
        title="Stored on this PC"
        description="Only in your Windows user folder, readable only by your Windows account."
      >
        <ul className="privacy-list">
          <li>Your settings.</li>
          <li>Your Gemini API key, if you added one, encrypted by Windows.</li>
          <li>Speech models you downloaded.</li>
        </ul>
      </Section>

      <Section
        title="When you use online features"
        description="These services handle your data under their own terms, not GameMate's."
      >
        <ul className="privacy-list">
          <li>
            <strong>Google Gemini:</strong>{' '}
            <ExternalLink href={LINKS.geminiTerms}>Gemini API terms</ExternalLink> and{' '}
            <ExternalLink href={LINKS.googlePrivacy}>Google Privacy Policy</ExternalLink>.
          </li>
          <li>
            <strong>minecraft.wiki:</strong>{' '}
            <ExternalLink href={LINKS.wikiDisclaimer}>wiki disclaimers</ExternalLink>. Page text is
            available under CC BY-NC-SA 3.0, so answers that use it link to the page.
          </li>
        </ul>
      </Section>

      <Section
        title="Delete my data"
        description="Removes everything above from this PC and resets GameMate as if it were just installed. Data already sent to Google is covered by Google's policies."
      >
        {deleted ? (
          <p className="ok-text">Done. Everything GameMate stored has been deleted.</p>
        ) : confirming ? (
          <div className="button-row">
            <button type="button" className="danger" onClick={deleteData}>
              Yes, delete everything
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="danger" onClick={() => setConfirming(true)}>
            Delete my data
          </button>
        )}
      </Section>
    </>
  )
}

export default PrivacyPanel
