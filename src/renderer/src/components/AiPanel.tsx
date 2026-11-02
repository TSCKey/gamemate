import { useEffect, useState } from 'react'
import type { AnswerEngine, Engine, Settings } from '../../../preload/index.d'
import { errorMessage } from '../hooks/useSettings'
import { LINKS } from '../constants'
import { ExternalLink, Field, Section, Toggle } from './ui'

// A sensible default from the player's model list: a regular Flash model if there is one.
function pickDefaultModel(models: string[]): string {
  const flash = models.filter((m) => /flash/.test(m) && !/lite|image|tts|live|audio|embed/.test(m))
  return (flash.find((m) => !/preview|exp/.test(m)) ?? flash[0] ?? models[0]) || ''
}

// What the player agrees to before anything is sent to Google.
function GeminiConsent({ onAgree }: { onAgree: () => void }): React.JSX.Element {
  const [checked, setChecked] = useState(false)
  return (
    <div className="consent">
      <p>Gemini is an optional cloud AI from Google. If you turn it on:</p>
      <ul className="privacy-list">
        <li>
          For the jobs you set to Gemini, your questions, the chat so far and any screenshots are
          sent to Google and processed on Google&apos;s servers, which may be outside your country.
        </li>
        <li>
          Google handles that data under the{' '}
          <ExternalLink href={LINKS.geminiTerms}>Gemini API terms</ExternalLink> and{' '}
          <ExternalLink href={LINKS.googlePrivacy}>Google Privacy Policy</ExternalLink>, not
          GameMate&apos;s. With a free key, Google may use what you send to improve its products and
          people may review it, except in the EU/EEA, Switzerland and the UK. Don&apos;t share
          personal information.
        </li>
        <li>
          Google requires you to be 18 or older. In the EU/EEA, Switzerland and the UK,
          Google&apos;s terms ask for a paid (billing-enabled) API key in apps like this.
        </li>
        <li>You can turn Gemini off any time. GameMate then deletes your key.</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I&apos;m 18 or older and agree to send this data to Google.
      </label>
      <div className="button-row">
        <button type="button" className="primary" disabled={!checked} onClick={onAgree}>
          Turn on Gemini
        </button>
      </div>
    </div>
  )
}

function AiPanel({
  settings,
  update,
  localName
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  // The model "On this PC" stands for: built-in or Ollama.
  localName: string
}): React.JSX.Element {
  const [hasKey, setHasKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const consent = settings.geminiConsent

  useEffect(() => {
    if (!consent) return
    window.api.gemini.status().then(({ hasKey }) => {
      setHasKey(hasKey)
      if (hasKey) window.api.gemini.models().then(setModels, (e) => setError(errorMessage(e)))
    })
  }, [consent])

  const saveKey = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const list = await window.api.gemini.setKey(keyInput)
      setHasKey(true)
      setModels(list)
      setKeyInput('')
      if (!list.includes(settings.geminiModel)) update({ geminiModel: pickDefaultModel(list) })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const removeKey = async (): Promise<void> => {
    await window.api.gemini.clearKey()
    setHasKey(false)
    setModels([])
    // Without a key Gemini can't be used, so fall back to the local model.
    update({ answersEngine: 'local', commentaryEngine: 'local' })
  }

  const turnOff = (): void => {
    // The main process deletes the key and switches both jobs back to the local model.
    update({ geminiConsent: false })
    setHasKey(false)
    setModels([])
  }

  const engineSelect = <T extends AnswerEngine>(
    value: T,
    onChange: (engine: T) => void,
    label: string,
    withAuto = false
  ): React.JSX.Element => (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
      {withAuto && (
        <option value="auto" disabled={!hasKey}>
          Auto (decide per question){hasKey ? '' : ' (add a key first)'}
        </option>
      )}
      <option value="local">On this PC ({localName})</option>
      <option value="gemini" disabled={!hasKey}>
        Gemini{hasKey ? '' : ' (add a key first)'}
      </option>
    </select>
  )

  return (
    <>
      <Section
        title="Which AI answers"
        description="Everything runs on this PC unless you choose Gemini for a job."
      >
        <Field
          label="Your questions"
          help={
            settings.answersEngine === 'auto'
              ? 'Auto: quick questions and recipes stay on this PC; screenshots and questions that need more thinking (strategy, builds, farms, bosses) go to Gemini. If one AI can’t be reached, the other answers.'
              : 'Chat and the in-game window.'
          }
        >
          {engineSelect(
            settings.answersEngine,
            (answersEngine) => update({ answersEngine }),
            'AI for questions',
            true
          )}
        </Field>
        <Field
          label="Companion"
          help="Watching your game. On Gemini this sends screenshots every few seconds, which can use up a free key's limits."
        >
          {engineSelect<Engine>(
            settings.commentaryEngine,
            (commentaryEngine) => update({ commentaryEngine }),
            'AI for the companion'
          )}
        </Field>
      </Section>

      <Section
        title="Google Gemini"
        description="Smarter answers and better screen understanding, using your own Google API key."
      >
        {!consent ? (
          <GeminiConsent onAgree={() => update({ geminiConsent: true })} />
        ) : (
          <>
            {hasKey ? (
              <>
                <Field label="Model" help="Flash models are fast and have the most free use.">
                  <select
                    value={settings.geminiModel}
                    onChange={(e) => update({ geminiModel: e.target.value })}
                  >
                    {!models.includes(settings.geminiModel) && (
                      <option value={settings.geminiModel}>
                        {settings.geminiModel || 'Choose…'}
                      </option>
                    )}
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="API key" help="Saved on this PC, encrypted by Windows.">
                  <button type="button" onClick={removeKey}>
                    Remove key
                  </button>
                </Field>
              </>
            ) : (
              <Field
                label="API key"
                help={
                  <>
                    Get one at{' '}
                    <ExternalLink href={LINKS.geminiKey}>aistudio.google.com</ExternalLink>.
                    GameMate checks it with Google before saving it.
                  </>
                }
              >
                <form
                  className="key-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveKey()
                  }}
                >
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Paste your key"
                    aria-label="Gemini API key"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit" className="primary" disabled={busy || !keyInput.trim()}>
                    {busy ? 'Checking…' : 'Save'}
                  </button>
                </form>
              </Field>
            )}
            {error && <p className="error-text">{error}</p>}
            <Field label="Turn off Gemini" help="Deletes your key and goes back to the local AI.">
              <button type="button" className="danger" onClick={turnOff}>
                Turn off
              </button>
            </Field>
          </>
        )}
      </Section>

      <Section title="Look things up">
        <Field
          label="Look things up online"
          help="Lets the AI read your game's wiki (and Modrinth for Minecraft mods) when it isn't sure, for things like bosses, items or building a Nether portal. Only the topic is sent, and answers link to the page and can show its pictures, like maps."
        >
          <Toggle
            label="Look things up online"
            checked={settings.webLookup}
            onChange={(webLookup) => update({ webLookup })}
          />
        </Field>
      </Section>
    </>
  )
}

export default AiPanel
