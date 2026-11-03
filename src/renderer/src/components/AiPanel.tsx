import { useEffect, useState } from 'react'
import type { AnswerEngine, Engine, Settings } from '../../../preload/index.d'
import { errorMessage } from '../hooks/useSettings'
import { LINKS } from '../constants'
import { ExternalLink, Field, Section, Toggle } from './ui'
import { Trans } from 'react-i18next'
import { t } from '../i18n'

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
      <p>{t('aiPanel.geminiIsAnOptionalCloud')}</p>
      <ul className="privacy-list">
        <li>{t('aiPanel.forTheJobsYouSet')}</li>
        <li>
          <Trans
            i18nKey="aiPanel.googleHandlesThatData"
            components={{
              terms: <ExternalLink href={LINKS.geminiTerms} />,
              privacy: <ExternalLink href={LINKS.googlePrivacy} />
            }}
          />
        </li>
        <li>{t('aiPanel.googleRequiresYouToBe')}</li>
        <li>{t('aiPanel.youCanTurnGeminiOff')}</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        {t('aiPanel.iM18OrOlder')}
      </label>
      <div className="button-row">
        <button type="button" className="primary" disabled={!checked} onClick={onAgree}>
          {t('aiPanel.turnOnGemini')}
        </button>
      </div>
    </div>
  )
}

// What the player agrees to before GameMate searches the web through Gemini.
function SearchConsent({
  onAgree,
  onCancel
}: {
  onAgree: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="consent">
      <p>{t('aiPanel.ifYouTurnOnWeb')}</p>
      <ul className="privacy-list">
        <li>{t('aiPanel.forQuestionsAboutWhatS')}</li>
        <li>
          <Trans
            i18nKey="aiPanel.googleSearchesTheWeb"
            components={{
              terms: <ExternalLink href={LINKS.geminiTerms} />,
              privacy: <ExternalLink href={LINKS.googlePrivacy} />
            }}
          />
        </li>
        <li>{t('aiPanel.searchesCountTowardYourKey')}</li>
        <li>{t('aiPanel.youCanTurnWebSearch')}</li>
      </ul>
      <div className="button-row">
        <button type="button" className="primary" onClick={onAgree}>
          {t('aiPanel.turnOnWebSearch')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('aiPanel.cancel')}
        </button>
      </div>
    </div>
  )
}

// What the player agrees to before GameMate looks things up online.
function LookupsConsent({
  onAgree,
  onCancel
}: {
  onAgree: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <div className="consent">
      <p>{t('aiPanel.ifYouTurnOnOnline')}</p>
      <ul className="privacy-list">
        <li>{t('aiPanel.whenAQuestionIsAbout')}</li>
        <li>{t('aiPanel.gamemateDownloadsThePageAnd')}</li>
        <li>{t('aiPanel.youCanTurnLookupsOff')}</li>
      </ul>
      <div className="button-row">
        <button type="button" className="primary" onClick={onAgree}>
          {t('aiPanel.turnOnLookups')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('aiPanel.cancel')}
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
  const [askLookups, setAskLookups] = useState(false)
  const [askSearch, setAskSearch] = useState(false)
  // Web search goes through Gemini, so it needs Gemini turned on with a key.
  const searchPossible = consent && hasKey

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
          {hasKey ? t('aiPanel.autoDecidePerQuestion') : t('aiPanel.autoAddAKeyFirst')}
        </option>
      )}
      <option value="local">{t('aiPanel.onThisPc', { name: localName })}</option>
      <option value="gemini" disabled={!hasKey}>
        {hasKey ? 'Gemini' : t('aiPanel.geminiAddAKeyFirst')}
      </option>
    </select>
  )

  return (
    <>
      <Section
        title={t('aiPanel.whichAiAnswers')}
        description={t('aiPanel.everythingRunsOnThisPc')}
      >
        <Field
          label={t('aiPanel.yourQuestions')}
          help={
            settings.answersEngine === 'auto'
              ? 'Auto: quick questions and recipes stay on this PC; screenshots and questions that need more thinking (strategy, builds, farms, bosses) go to Gemini. If one AI can’t be reached, the other answers.'
              : t('aiPanel.chatAndTheInGame')
          }
        >
          {engineSelect(
            settings.answersEngine,
            (answersEngine) => update({ answersEngine }),
            t('aiPanel.aiForQuestions'),
            true
          )}
        </Field>
        <Field label={t('aiPanel.companion')} help={t('aiPanel.watchingYourGameOnGemini')}>
          {engineSelect<Engine>(
            settings.commentaryEngine,
            (commentaryEngine) => update({ commentaryEngine }),
            t('aiPanel.aiForTheCompanion')
          )}
        </Field>
      </Section>

      <Section title="Google Gemini" description={t('aiPanel.smarterAnswersAndBetterScreen')}>
        {!consent ? (
          <GeminiConsent onAgree={() => update({ geminiConsent: true })} />
        ) : (
          <>
            {hasKey ? (
              <>
                <Field label={t('aiPanel.model')} help={t('aiPanel.flashModelsAreFastAnd')}>
                  <select
                    value={settings.geminiModel}
                    onChange={(e) => update({ geminiModel: e.target.value })}
                  >
                    {!models.includes(settings.geminiModel) && (
                      <option value={settings.geminiModel}>
                        {settings.geminiModel || t('aiPanel.choose')}
                      </option>
                    )}
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('aiPanel.apiKey')} help={t('aiPanel.savedOnThisPcEncrypted')}>
                  <button type="button" onClick={removeKey}>
                    {t('aiPanel.removeKey')}
                  </button>
                </Field>
              </>
            ) : (
              <Field
                label={t('aiPanel.apiKey')}
                help={
                  <Trans
                    i18nKey="aiPanel.getOneAt"
                    components={{ link: <ExternalLink href={LINKS.geminiKey} /> }}
                  />
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
                    placeholder={t('aiPanel.pasteYourKey')}
                    aria-label={t('aiPanel.geminiApiKey')}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit" className="primary" disabled={busy || !keyInput.trim()}>
                    {busy ? t('aiPanel.checking') : t('aiPanel.save')}
                  </button>
                </form>
              </Field>
            )}
            {error && <p className="error-text">{error}</p>}
            <Field label={t('aiPanel.turnOffGemini')} help={t('aiPanel.deletesYourKeyAndGoes')}>
              <button type="button" className="danger" onClick={turnOff}>
                {t('aiPanel.turnOff')}
              </button>
            </Field>
          </>
        )}
      </Section>

      <Section title={t('aiPanel.answers')}>
        <Field
          label={t('aiPanel.detailedAnswers')}
          help={
            settings.detailedAnswers
              ? t('aiPanel.answersExplainTheDetailsSteps')
              : t('aiPanel.answersGetStraightToThe')
          }
        >
          <Toggle
            label={t('aiPanel.detailedAnswers')}
            checked={settings.detailedAnswers}
            onChange={(detailedAnswers) => update({ detailedAnswers })}
          />
        </Field>
      </Section>

      <Section title={t('aiPanel.lookThingsUp')}>
        <Field label={t('aiPanel.lookThingsUpOnline')} help={t('aiPanel.letsTheAiReadYour')}>
          <Toggle
            label={t('aiPanel.lookThingsUpOnline')}
            checked={settings.webLookup}
            // Turning lookups on is a consent: explain it first. Turning them off is immediate.
            onChange={(webLookup) => (webLookup ? setAskLookups(true) : update({ webLookup }))}
          />
        </Field>
        {askLookups && !settings.webLookup && (
          <LookupsConsent
            onAgree={() => {
              update({ webLookup: true })
              setAskLookups(false)
            }}
            onCancel={() => setAskLookups(false)}
          />
        )}
        <Field
          label={t('aiPanel.searchTheWeb')}
          help={
            searchPossible ? t('aiPanel.letsTheAiSearchThe') : t('aiPanel.searchesTheWebWithGoogle')
          }
        >
          <Toggle
            label={t('aiPanel.searchTheWeb')}
            checked={settings.webSearch}
            disabled={!searchPossible}
            onChange={(webSearch) => (webSearch ? setAskSearch(true) : update({ webSearch }))}
          />
        </Field>
        {askSearch && !settings.webSearch && searchPossible && (
          <SearchConsent
            onAgree={() => {
              update({ webSearch: true })
              setAskSearch(false)
            }}
            onCancel={() => setAskSearch(false)}
          />
        )}
      </Section>
    </>
  )
}

export default AiPanel
