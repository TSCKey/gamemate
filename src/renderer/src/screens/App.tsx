import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, CaptureSource, ChatMessage, CompanionState } from '../../../preload/index.d'
import CompanionMenu from '../components/CompanionMenu'
import GameMenu from '../components/GameMenu'
import ModelMenu from '../components/ModelMenu'
import TermsGate from '../legal/TermsGate'
import SetupCard from '../components/SetupCard'
import { TERMS_VERSION } from '../constants'
import RecipeCard from '../components/RecipeCard'
import Pictures from '../components/Pictures'
import Sources from '../components/Sources'
import AnsweredByLabel from '../components/AnsweredByLabel'
import SettingsScreen, { type SettingsTab } from './SettingsScreen'
import { speak } from '../voice/speak'
import { useVoiceInput } from '../voice/useVoiceInput'
import { errorMessage, useSettings } from '../hooks/useSettings'
import { localModelInfo, useLocalModels } from '../hooks/useLocalModels'
import { useGames, useModpack } from '../hooks/useGames'
import logo from '../assets/logo.png'

const DEFAULT_SCREEN_QUESTION = 'What is happening on my screen?'

// Prefer a game window, then the main screen.
function pickDefaultSource(sources: CaptureSource[]): string {
  const game = sources.find((s) => s.type === 'window' && /minecraft/i.test(s.name))
  return (game ?? sources.find((s) => s.type === 'screen') ?? sources[0])?.id ?? ''
}

function sourceLabel(source: CaptureSource, screenCount: number): string {
  if (source.type === 'window') return source.name
  return screenCount > 1 ? source.name : 'Entire screen'
}

function App(): React.JSX.Element {
  const { settings, models, modelError, update, reloadModels } = useSettings()
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
  const suggestions = game?.examples ?? []
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
    window.api.getAppInfo().then(setAppInfo)
    window.api.companion.getState().then(setCompanion)
    return window.api.companion.onState(setCompanion)
  }, [])

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

    const content = typed || DEFAULT_SCREEN_QUESTION
    const history: ChatMessage[] = [...messages, { role: 'user', content, images }]
    setMessages(history)
    setInput('')
    setStatus('thinking')

    try {
      const reply = await window.api.ask(history, setWritten)
      setMessages([...history, reply])
      const say = settings?.speakAnswers
      if (settings && (say === 'always' || (say === 'voice' && byVoice))) {
        speak(reply.content)
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWritten('')
      setStatus('idle')
    }
  }

  // Spoken questions are sent as soon as they're transcribed.
  const voice = useVoiceInput(settings, (text) => send(text, willAttach, true))

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // GameMate can't be used until the current Terms of Use are accepted.
  const notice =
    settings && settings.termsVersion < TERMS_VERSION ? <TermsGate settings={settings} /> : null

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
            New chat
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setSettingsTab('general')}
            title="Settings"
            aria-label="Settings"
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
            <h2>What can I help with?</h2>
            <div className="suggestions">
              {suggestions.map((q) => (
                <button key={q} type="button" disabled={!ready} onClick={() => send(q, false)}>
                  {q}
                </button>
              ))}
              {visionModel && sourceId && (
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => {
                    setAttachScreenshot(true)
                    send(DEFAULT_SCREEN_QUESTION, true)
                  }}
                >
                  📷 What&apos;s on my screen?
                </button>
              )}
            </div>
            {appInfo &&
              (appInfo.shortcutRegistered ? (
                <p className="chat-hint">
                  Press <kbd>{appInfo.shortcut}</kbd> in any game to ask without leaving it.
                </p>
              ) : (
                <p className="chat-hint">
                  <kbd>{appInfo.shortcut}</kbd> is used by another app, so the in-game shortcut is
                  off. Close that app and restart GameMate.
                </p>
              ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble-${m.role}`}>
            {m.images?.map((img, j) => (
              <img
                key={j}
                className="bubble-screenshot"
                src={`data:image/jpeg;base64,${img}`}
                alt="Screenshot sent with this question"
              />
            ))}
            {m.content}
            {m.recipes?.map((r, j) => (
              <RecipeCard key={j} recipe={r} />
            ))}
            <Pictures pictures={m.pictures} />
            <Sources sources={m.sources} />
            {onAuto && m.answeredBy && <AnsweredByLabel by={m.answeredBy} />}
          </div>
        ))}
        {loading && written && <div className="bubble bubble-assistant">{written}</div>}
        {loading && !written && (
          <div className="bubble bubble-assistant bubble-pending">
            {status === 'capturing' ? 'Capturing screen…' : 'Thinking…'}
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
                ? 'Download GameMate’s AI to start'
                : 'Pick an AI model in Settings first'
              : voice.status === 'listening'
                ? 'Listening…'
                : voice.status === 'transcribing'
                  ? 'Working out what you said…'
                  : willAttach
                    ? 'Ask about your screen… (or just press Enter)'
                    : `Ask about ${game?.name ?? 'your game'}…`
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
                title="Send a screenshot with your question"
              >
                📷 Screenshot
              </button>
              {attachScreenshot && (
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  onFocus={loadSources}
                  aria-label="Screenshot source"
                >
                  {sources.length === 0 && <option value="">Nothing to capture</option>}
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
                ? 'Screen access is off (Companion: Disabled).'
                : ready
                  ? 'This model can’t see screenshots.'
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
                title={voice.status === 'listening' ? 'Listening, click to stop' : 'Ask by voice'}
                aria-label="Ask by voice"
              >
                🎤
              </button>
            )}
            <button
              type="submit"
              className="primary"
              disabled={!ready || loading || (!input.trim() && !willAttach)}
            >
              Send
            </button>
          </div>
        </div>
      </form>
      {notice}
    </div>
  )
}

export default App
