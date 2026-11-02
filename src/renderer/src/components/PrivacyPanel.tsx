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
        <strong>Finding your games</strong> only happens after you allow it in Settings → Games.
        Then GameMate reads your launchers&apos; game lists (Steam, Epic Games, Battle.net, Riot),
        your CurseForge modpacks and the name of the program in front. This stays on your PC; to
        find wikis, only game names are sent to wiki.gg and Fandom.
      </li>
      <li>
        <strong>Your microphone</strong> is only used when voice input is on and you press the voice
        shortcut or 🎤. Speech is turned into text on this PC.
      </li>
      <li>
        <strong>Chats and the companion log</strong> are kept only while GameMate is open.
      </li>
      <li>
        <strong>Online features are off until you turn them on:</strong> looking things up on your
        game&apos;s wiki or Modrinth (only the topic is sent) and Google Gemini (your questions and
        screenshots are sent to Google). Downloads happen once, when you ask for them: AI and speech
        models come from Hugging Face, and GameMate&apos;s AI engine from GitHub. Update checks ask
        GitHub for the latest GameMate version (you can turn them off).
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
          <li>AI models, GameMate&apos;s AI engine and speech models you downloaded.</li>
          <li>Games found or added: their name, folder or program, and wiki address.</li>
          <li>
            A log of what GameMate did (like starting the AI or checking for updates), for finding
            problems. It never contains your questions or answers and is never sent anywhere.{' '}
            <button type="button" className="link-button" onClick={() => window.api.openLogs()}>
              Open log folder
            </button>
          </li>
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
            <strong>Game wikis and Modrinth:</strong> each wiki&apos;s text is under its own license
            (shown with every answer that uses it, for example{' '}
            <ExternalLink href={LINKS.wikiDisclaimer}>minecraft.wiki</ExternalLink>), so answers
            link to the page. Pictures in answers are downloaded from the same wikis and link to
            their page there.
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
