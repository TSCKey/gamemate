import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, CaptureSource, ChatMessage, CompanionState } from '../../preload/index.d'
import PrivacyNotice from './components/PrivacyNotice'
import { PRIVACY_NOTICE_VERSION, STATUS_TEXT } from './constants'
import RecipeCard from './components/RecipeCard'
import Sources from './components/Sources'
import AnsweredByLabel from './components/AnsweredByLabel'
import SettingsScreen, { type SettingsTab } from './SettingsScreen'
import { speak } from './voice/speak'
import { useVoiceInput } from './voice/useVoiceInput'
import { errorMessage, useSettings } from './useSettings'

const DEFAULT_SCREEN_QUESTION = 'What is happening on my screen?'

const SUGGESTIONS = ['How do I craft a piston?', 'How do I build a Nether portal?']

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
  const [versions, setVersions] = useState<string[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [companion, setCompanion] = useState<CompanionState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'capturing' | 'thinking'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [sourceId, setSourceId] = useState('')
  const [attachScreenshot, setAttachScreenshot] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const model = settings?.model ?? ''
  const loading = status !== 'idle'
  const onGemini = settings?.answersEngine === 'gemini'
  const onAuto = settings?.answersEngine === 'auto'
  const ready = onGemini
    ? Boolean(settings?.geminiModel)
    : Boolean(model) || (onAuto && Boolean(settings?.geminiModel))
  // In "Disabled" mode GameMate doesn't look at the screen at all.
  const screenAllowed = settings?.companionMode !== 'disabled'
  const visionModel =
    (onGemini || onAuto || (models.find((m) => m.name === model)?.vision ?? false)) && screenAllowed
  const willAttach = attachScreenshot && visionModel && sourceId !== ''
  const screenCount = sources.filter((s) => s.type === 'screen').length
  const shownError = error ?? (onGemini ? null : modelError)

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
    window.api.listMinecraftVersions().then(setVersions)
    window.api.getAppInfo().then(setAppInfo)
    window.api.companion.getState().then(setCompanion)
    const stopCompanion = window.api.companion.onState(setCompanion)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the IPC call resolves
    loadSources()
    // Windows open and close while GameMate is in the background; refresh when it regains focus.
    window.addEventListener('focus', loadSources)
    return () => {
      stopCompanion()
      window.removeEventListener('focus', loadSources)
    }
  }, [loadSources])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

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
      const reply = await window.api.ask(history)
      setMessages([...history, reply])
      const say = settings?.speakAnswers
      if (settings && (say === 'always' || (say === 'voice' && byVoice))) {
        speak(reply.content)
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
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

  const notice =
    settings && settings.privacyNoticeVersion < PRIVACY_NOTICE_VERSION ? (
      <PrivacyNotice
        onAccept={() => update({ privacyNoticeVersion: PRIVACY_NOTICE_VERSION })}
        onMore={() => {
          update({ privacyNoticeVersion: PRIVACY_NOTICE_VERSION })
          setSettingsTab('privacy')
        }}
      />
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
          versions={versions}
          appInfo={appInfo}
        />
        {notice}
      </>
    )
  }

  const engineLabel = onAuto
    ? '✦ Auto'
    : onGemini
      ? `☁ ${settings?.geminiModel || 'Gemini'}`
      : model || 'No model'
  const companionOn = companion !== null && companion.status !== 'off'

  return (
    <div className="chat">
      <header className="chat-header">
        <div className="brand">
          <span className="brand-mark">GM</span>
          <span className="brand-name">GameMate</span>
        </div>
        <div className="chips">
          <button
            type="button"
            className="chip"
            onClick={() => setSettingsTab(onGemini || onAuto ? 'ai' : 'general')}
            title="Which AI answers"
          >
            {engineLabel}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => setSettingsTab('general')}
            title="Minecraft version"
          >
            Minecraft {settings?.minecraftVersion}
          </button>
          {companionOn && (
            <button
              type="button"
              className={`chip companion-status is-${companion.status}`}
              onClick={() => setSettingsTab('companion')}
              title="Companion"
            >
              <span className="companion-dot" /> {STATUS_TEXT[companion.status]}
            </button>
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
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <div className="brand-mark is-large">GM</div>
            <h2>What can I help with?</h2>
            <div className="suggestions">
              {SUGGESTIONS.map((q) => (
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
            <Sources sources={m.sources} />
            {onAuto && m.answeredBy && <AnsweredByLabel by={m.answeredBy} />}
          </div>
        ))}
        {loading && (
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
              ? 'Pick an AI model in Settings first'
              : voice.status === 'listening'
                ? 'Listening…'
                : voice.status === 'transcribing'
                  ? 'Working out what you said…'
                  : willAttach
                    ? 'Ask about your screen… (or just press Enter)'
                    : 'Ask about Minecraft…'
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
