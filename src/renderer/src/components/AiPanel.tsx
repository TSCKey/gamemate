import { useEffect, useState } from 'react'
import type { Engine, Settings } from '../../../preload/index.d'
import { errorMessage } from '../useSettings'

// A sensible default from the player's model list: a regular Flash model if there is one.
function pickDefaultModel(models: string[]): string {
  const flash = models.filter((m) => /flash/.test(m) && !/lite|image|tts|live|audio|embed/.test(m))
  return (flash.find((m) => !/preview|exp/.test(m)) ?? flash[0] ?? models[0]) || ''
}

function AiPanel({
  settings,
  update
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [hasKey, setHasKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.gemini.status().then(({ hasKey }) => {
      setHasKey(hasKey)
      if (hasKey) window.api.gemini.models().then(setModels, (e) => setError(errorMessage(e)))
    })
  }, [])

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

  const engineSelect = (value: Engine, onChange: (engine: Engine) => void): React.JSX.Element => (
    <select value={value} onChange={(e) => onChange(e.target.value as Engine)}>
      <option value="local">Local model ({settings.model || 'none'})</option>
      <option value="gemini" disabled={!hasKey}>
        Gemini{hasKey ? '' : ' (add a key first)'}
      </option>
    </select>
  )

  const usesCloud = settings.answersEngine === 'gemini' || settings.commentaryEngine === 'gemini'

  return (
    <section className="companion voice">
      <h2>Which AI answers</h2>
      <div className="companion-row">
        <label>
          Questions
          {engineSelect(settings.answersEngine, (answersEngine) => update({ answersEngine }))}
        </label>
        <label>
          Companion
          {engineSelect(settings.commentaryEngine, (commentaryEngine) =>
            update({ commentaryEngine })
          )}
        </label>
      </div>
      <p className="companion-help">
        {usesCloud
          ? 'Gemini runs on Google’s servers: questions and screenshots for the jobs set to Gemini are sent to Google. It needs an internet connection, and heavy use (especially the companion) may go past the free limits of your key.'
          : 'Everything runs on this PC. Choose Gemini for smarter answers and better screen understanding, using your own Google API key.'}
      </p>

      <h2>Gemini</h2>
      {hasKey ? (
        <div className="companion-row">
          <label>
            Model
            <select
              value={settings.geminiModel}
              onChange={(e) => update({ geminiModel: e.target.value })}
            >
              {!models.includes(settings.geminiModel) && (
                <option value={settings.geminiModel}>{settings.geminiModel || 'Choose…'}</option>
              )}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <span className="voice-dim">API key saved (encrypted on this PC)</span>
          <button type="button" onClick={removeKey}>
            Remove key
          </button>
        </div>
      ) : (
        <form
          className="companion-row"
          onSubmit={(e) => {
            e.preventDefault()
            saveKey()
          }}
        >
          <input
            type="password"
            className="ai-key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste your Gemini API key"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={busy || !keyInput.trim()}>
            {busy ? 'Checking…' : 'Save key'}
          </button>
          <span className="voice-dim">Get a key at aistudio.google.com</span>
        </form>
      )}
      {error && <p className="voice-error">{error}</p>}

      <h2>Look things up</h2>
      <label className="voice-check">
        <input
          type="checkbox"
          checked={settings.webLookup}
          onChange={(e) => update({ webLookup: e.target.checked })}
        />
        Let the AI read minecraft.wiki for things like building a Nether portal, mobs and
        enchantments
      </label>
      <p className="companion-help">
        Only the topic is sent to minecraft.wiki. Answers that use the wiki link to the page.
      </p>
    </section>
  )
}

export default AiPanel
