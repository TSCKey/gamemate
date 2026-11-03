import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, CaptureSource, ChatMessage, CompanionState } from '../../../preload/index.d'
import CompanionMenu from '../components/CompanionMenu'
import GameMenu from '../components/GameMenu'
import ModelMenu from '../components/ModelMenu'
import TermsGate from '../legal/TermsGate'
import LanguagePicker from '../legal/LanguagePicker'
import { initialLanguage, type LanguageCode } from '../../../shared/languages'
import SetupCard from '../components/SetupCard'
import ChatBubble from '../components/ChatBubble'
import { TERMS_VERSION } from '../constants'
import SettingsScreen, { type SettingsTab } from './SettingsScreen'
import { speak } from '../voice/speak'
import { useVoiceInput } from '../voice/useVoiceInput'
import { errorMessage, useSettings } from '../hooks/useSettings'
import { localModelInfo, useLocalModels } from '../hooks/useLocalModels'
import { useGames, useModpack } from '../hooks/useGames'
import logo from '../assets/logo.png'
import { Trans } from 'react-i18next'
import { t, useAppLanguage } from '../i18n'

// Prefer a game window, then the main screen.
function pickDefaultSource(sources: CaptureSource[]): string {
  const game = sources.find((s) => s.type === 'window' && /minecraft/i.test(s.name))
  return (game ?? sources.find((s) => s.type === 'screen') ?? sources[0])?.id ?? ''
}

function sourceLabel(source: CaptureSource, screenCount: number): string {
  if (source.type === 'window') return source.name
  return screenCount > 1 ? source.name : t('app.entireScreen')
}

function App(): React.JSX.Element {
  const { settings, models, modelError, update, reloadModels } = useSettings()
  useAppLanguage(settings)
  const [systemLanguage, setSystemLanguage] = useState<LanguageCode | null>(null)
  const unchosen = settings?.language === ''
  useEffect(() => {
    if (unchosen) window.api.systemLanguage().then(setSystemLanguage)
  }, [unchosen])
  const localModels = useLocalModels()
  const games = useGames(settings)
  const modpack = useModpack(settings)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [companion, setCompanion] = useState<CompanionState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'capturing' | 'thinking'>('idle')
  // The answer so far, while it is being written.
  const [written, setWritten] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [sourceId, setSourceId] = useState('')
  const [attachScreenshot, setAttachScreenshot] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loading = status !== 'idle'
  const onGemini = settings?.answersEngine === 'gemini'
  const onAuto = settings?.answersEngine === 'auto'
  const local = settings
    ? localModelInfo(settings, localModels, models)
    : { ready: false, name: '', vision: false }
  const ready = onGemini
    ? Boolean(settings?.geminiModel)
    : local.ready || (onAuto && Boolean(settings?.geminiModel))
  // In "Disabled" mode GameMate doesn't look at the screen at all.
  const screenAllowed = settings?.companionMode !== 'disabled'
  const visionModel = (onGemini || onAuto || local.vision) && screenAllowed
  const willAttach = attachScreenshot && visionModel && sourceId !== ''
  const screenCount = sources.filter((s) => s.type === 'screen').length
  const game = games?.games.find((g) => g.id === settings?.currentGame)
  // The game's example questions, in the player's language.
  const suggestions = (game?.examples ?? []).map((key) => t(key))
  // Ollama problems only matter to players who use Ollama.
  const usesOllama = settings?.localBackend === 'ollama' && !onGemini
  const shownError = error ?? (usesOllama ? modelError : null)
  // First start: nothing can answer until GameMate's own AI is downloaded.
  const needsSetup =
    !ready && settings?.localBackend === 'builtin' && !localModels.some((m) => m.installed)

  const loadSources = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.listCaptureSources()
      setSources(list)
      setSourceId((current) =>
        list.some((s) => s.id === current) ? current : pickDefaultSource(list)
      )
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    window.api.companion.getState().then(setCompanion)
    return window.api.companion.onState(setCompanion)
  }, [])

  // Whether the shortcuts work, asked again when the player changes them.
  const shortcutKey = settings
    ? `${settings.shortcut}|${settings.voiceShortcut}|${settings.voiceInput}`
    : ''
  useEffect(() => {
    window.api.getAppInfo().then(setAppInfo)
  }, [shortcutKey])

  // Listing the screens and windows to capture waits until the Terms of Use are accepted.
  const accepted = !!settings && settings.termsVersion >= TERMS_VERSION
  useEffect(() => {
    if (!accepted) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the IPC call resolves
    loadSources()
    // Windows open and close while GameMate is in the background; refresh when it regains focus.
    window.addEventListener('focus', loadSources)
    return () => window.removeEventListener('focus', loadSources)
  }, [loadSources, accepted])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status, written])

  // The question being answered, so ■ can take it back: the chat as it was and what was typed.
  const asking = useRef<{ before: ChatMessage[]; typed: string } | null>(null)

  const send = async (
    text: string = input,
    withScreenshot = willAttach,
    byVoice = false
  ): Promise<void> => {
    const typed = text.trim()
    if (!ready || loading || (!typed && !withScreenshot)) return

    setError(null)
    let images: string[] | undefined
    if (withScreenshot) {
      setStatus('capturing')
      try {
        images = [(await window.api.captureScreenshot(sourceId)).base64]
      } catch (e) {
        setError(errorMessage(e))
        setStatus('idle')
        loadSources()
        return
      }
    }

    const content = typed || t('app.whatIsHappeningOnMy')
    const history: ChatMessage[] = [...messages, { role: 'user', content, images }]
    const mine = { before: messages, typed: text }
    asking.current = mine
    setMessages(history)
    setInput('')
    setStatus('thinking')

    try {
      const reply = await window.api.ask(history, setWritten)
      // Stopped with ■ meanwhile: the chat is already back to how it was.
      if (asking.current !== mine) return
      setMessages([...history, reply])
      const say = settings?.speakAnswers
      if (settings && (say === 'always' || (say === 'voice' && byVoice))) {
        speak(reply.content)
      }
    } catch (e) {
      if (asking.current === mine) setError(errorMessage(e))
    } finally {
      if (asking.current === mine) {
        asking.current = null
        setWritten('')
        setStatus('idle')
      }
    }
  }

  // ■: the answer stops, the question leaves the chat and goes back into the box to fix it.
  const stop = (): void => {
    const stopped = asking.current
    if (!stopped) return
    asking.current = null
    window.api.stopAsking()
    setMessages(stopped.before)
    setInput(stopped.typed)
    setWritten('')
    setStatus('idle')
  }

  // Spoken questions are sent as soon as they're transcribed.
  const voice = useVoiceInput(settings, (text) => send(text, willAttach, true))

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // First the language (once), then the current Terms of Use: GameMate can't be used until then.
  const notice = !settings ? null : settings.language === '' ? (
    systemLanguage && (
      <LanguagePicker
        initial={initialLanguage(settings.language, systemLanguage)}
        onChoose={(language) => update({ language })}
      />
    )
  ) : settings.termsVersion < TERMS_VERSION ? (
    <TermsGate settings={settings} />
  ) : null

  if (settingsTab && settings) {
    return (
      <>
        <SettingsScreen
          tab={settingsTab}
          onTab={setSettingsTab}
          onClose={() => setSettingsTab(null)}
          settings={settings}
          update={update}
          models={models}
          modelError={modelError}
          reloadModels={reloadModels}
          localModels={localModels}
          appInfo={appInfo}
        />
        {notice}
      </>
    )
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="brand">
          <img className="brand-mark" src={logo} alt="" />
          <span className="brand-name">GameMate</span>
        </div>
        <div className="chips">
          {settings && (
            <>
              <GameMenu
                settings={settings}
                update={update}
                games={games}
                modpack={modpack}
                onOpenSettings={() => setSettingsTab('games')}
              />
              <CompanionMenu
                settings={settings}
                update={update}
                state={companion}
                onOpenSettings={() => setSettingsTab('companion')}
              />
            </>
          )}
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setMessages([])}
            disabled={loading || messages.length === 0}
          >
            {t('app.newChat')}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSettingsTab('general')}
            title={t('app.settings')}
            aria-label={t('app.settings')}
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="chat-messages">
        {messages.length === 0 && !loading && needsSetup && settings && (
          <div className="chat-empty">
            <SetupCard
              models={localModels}
              update={update}
              onOpenModels={() => setSettingsTab('models')}
              onOpenAi={() => setSettingsTab('ai')}
            />
          </div>
        )}
        {messages.length === 0 && !loading && !needsSetup && (
          <div className="chat-empty">
            <img className="brand-mark is-large" src={logo} alt="GameMate" />
            <h2>{t('app.whatCanIHelpWith')}</h2>
            <div className="suggestions">
              {suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  dir="auto"
                  disabled={!ready}
                  onClick={() => send(q, false)}
                >
                  {q}
                </button>
              ))}
              {visionModel && sourceId && (
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => {
                    setAttachScreenshot(true)
                    send(t('app.whatIsHappeningOnMy'), true)
                  }}
                >
                  {t('app.whatSOnMyScreen')}
                </button>
              )}
            </div>
            {appInfo &&
              (appInfo.shortcutRegistered ? (
                <p className="chat-hint">
                  <Trans
                    i18nKey="app.pressShortcutInAnyGame"
                    values={{ shortcut: appInfo.shortcut }}
                    components={{ kbd: <kbd /> }}
                  />
                </p>
              ) : (
                <p className="chat-hint">
                  <Trans
                    i18nKey="app.shortcutIsUsedByAnother"
                    values={{ shortcut: appInfo.shortcut }}
                    components={{ kbd: <kbd /> }}
                  />
                </p>
              ))}
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} onAuto={onAuto} />
        ))}
        {loading && written && (
          <div className="bubble bubble-assistant" dir="auto">
            {written}
          </div>
        )}
        {loading && !written && (
          <div className="bubble bubble-assistant bubble-pending">
            {status === 'capturing' ? t('app.capturingScreen') : t('app.thinking')}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {(shownError || voice.error) && <div className="chat-error">{shownError ?? voice.error}</div>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            !ready
              ? needsSetup
                ? t('app.downloadGamemateSAiTo')
                : t('app.pickAnAiModelIn')
              : voice.status === 'listening'
                ? t('app.listening')
                : voice.status === 'transcribing'
                  ? t('app.workingOutWhatYouSaid')
                  : willAttach
                    ? t('app.askAboutYourScreenOr')
                    : t('app.askAbout', { value: game?.name ?? 'your game' })
          }
          rows={2}
          disabled={!ready || voice.status !== 'idle'}
        />
        <div className="composer-bar">
          {visionModel ? (
            <div className="screenshot-picker">
              <button
                type="button"
                className={`chip${willAttach ? ' is-on' : ''}`}
                onClick={() => setAttachScreenshot((on) => !on)}
                disabled={sources.length === 0}
                aria-pressed={willAttach}
                title={t('app.sendAScreenshotWithYour')}
              >
                {t('app.screenshot')}
              </button>
              {attachScreenshot && (
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  onFocus={loadSources}
                  aria-label={t('app.screenshotSource')}
                >
                  {sources.length === 0 && <option value="">{t('app.nothingToCapture')}</option>}
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sourceLabel(s, screenCount)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <span className="composer-hint">
              {!screenAllowed
                ? t('app.screenAccessIsOffCompanion')
                : ready
                  ? t('app.thisModelCanTSee')
                  : ''}
            </span>
          )}
          <div className="composer-actions">
            {settings && (
              <ModelMenu
                settings={settings}
                update={update}
                models={models}
                localModels={localModels}
                onOpenSettings={setSettingsTab}
              />
            )}
            {voice.ready && (
              <button
                type="button"
                className={`icon-button${voice.status === 'listening' ? ' is-listening' : ''}`}
                onClick={voice.toggle}
                disabled={!ready || loading || voice.status === 'transcribing'}
                title={
                  voice.status === 'listening' ? t('app.listeningClickToStop') : t('app.askByVoice')
                }
                aria-label={t('app.askByVoice')}
              >
                🎤
              </button>
            )}
            {status === 'thinking' ? (
              <button
                type="button"
                className="primary stop-button"
                onClick={stop}
                title={t('app.stop')}
                aria-label={t('app.stop')}
              >
                ■
              </button>
            ) : (
              <button
                type="submit"
                className="primary"
                disabled={!ready || loading || (!input.trim() && !willAttach)}
              >
                {t('app.send')}
              </button>
            )}
          </div>
        </div>
      </form>
      {notice}
    </div>
  )
}

export default App
