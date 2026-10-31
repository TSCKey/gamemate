import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../preload/index.d'
import RecipeCard from './components/RecipeCard'
import Sources from './components/Sources'
import { errorMessage, useSettings } from './useSettings'
import { speak, stopSpeaking } from './voice/speak'
import { useVoiceInput } from './voice/useVoiceInput'

// Reopening after this long starts a new conversation instead of continuing the old one.
const FRESH_CONVERSATION_MS = 10 * 60 * 1000
// Transparent space around the panel, so its shadow isn't clipped by the window edge.
const WINDOW_PADDING = 24

function Overlay(): React.JSX.Element {
  const { settings, models, update } = useSettings()
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastActivity = useRef(0)
  const [appVoiceShortcut, setAppVoiceShortcut] = useState('')

  const model = settings?.model ?? ''
  // In "Disabled" mode GameMate doesn't look at the screen at all.
  const vision =
    (models.find((m) => m.name === model)?.vision ?? false) &&
    settings?.companionMode !== 'disabled'
  const useScreenshot = vision && (settings?.overlayScreenshot ?? false)
  const lastQuestion = [...history].reverse().find((m) => m.role === 'user')
  const lastAnswer = history.at(-1)?.role === 'assistant' ? history.at(-1) : undefined
  const listenRef = useRef<() => void>(() => {})

  useEffect(
    () =>
      window.api.overlay.onShown((listen) => {
        if (Date.now() - lastActivity.current > FRESH_CONVERSATION_MS) {
          setHistory([])
          setError(null)
        }
        inputRef.current?.focus()
        inputRef.current?.select()
        if (listen) listenRef.current()
      }),
    []
  )

  useEffect(() => window.api.overlay.onListen(() => listenRef.current()), [])

  useEffect(() => {
    window.api.getAppInfo().then((info) => setAppVoiceShortcut(info.voiceShortcut))
  }, [])

  // Grow and shrink the window with its content.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver(() =>
      window.api.overlay.setHeight(panel.offsetHeight + WINDOW_PADDING * 2)
    )
    observer.observe(panel)
    return () => observer.disconnect()
  }, [])

  const send = async (text: string = input, byVoice = false): Promise<void> => {
    const content = text.trim()
    if (!content || !model || thinking) return

    setError(null)
    setThinking(true)
    lastActivity.current = Date.now()
    try {
      // The screenshot was taken when the shortcut was pressed, so it shows the game.
      const shot = useScreenshot ? await window.api.overlay.takeScreenshot() : null
      const next: ChatMessage[] = [
        ...history,
        { role: 'user', content, ...(shot ? { images: [shot.base64] } : {}) }
      ]
      setHistory(next)
      setInput('')
      const reply = await window.api.ask(next)
      setHistory([...next, reply])
      const say = settings?.speakAnswers
      if (settings && (say === 'always' || (say === 'voice' && byVoice))) {
        speak(reply.content)
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setThinking(false)
      lastActivity.current = Date.now()
    }
  }

  // Spoken questions are sent as soon as they're transcribed.
  const voice = useVoiceInput(settings, (text) => send(text, true))
  useEffect(() => {
    listenRef.current = voice.toggle
  })

  const hide = (): void => {
    voice.cancel()
    stopSpeaking()
    window.api.overlay.hide()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    } else if (e.key === 'Escape') {
      hide()
    }
  }

  return (
    <div className="overlay" style={{ padding: WINDOW_PADDING }}>
      <div className="overlay-panel" ref={panelRef}>
        <div className="overlay-bar">
          <span className="overlay-handle" title="Drag to move">
            🎮
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              !model
                ? 'Open GameMate and pick a model first'
                : voice.status === 'listening'
                  ? 'Listening…'
                  : voice.status === 'transcribing'
                    ? 'Working out what you said…'
                    : 'Ask GameMate…'
            }
            disabled={!model || voice.status !== 'idle'}
            autoFocus
          />
          {voice.ready && (
            <button
              type="button"
              className={
                voice.status === 'listening'
                  ? 'overlay-toggle is-on is-listening'
                  : 'overlay-toggle'
              }
              style={
                voice.status === 'listening'
                  ? {
                      boxShadow: `0 0 0 ${Math.min(8, voice.level * 120)}px rgba(63, 185, 80, 0.35)`
                    }
                  : undefined
              }
              onClick={voice.toggle}
              disabled={!model || voice.status === 'transcribing' || thinking}
              title={
                voice.status === 'listening'
                  ? 'Listening, click to stop'
                  : `Ask by voice (${appVoiceShortcut})`
              }
            >
              🎤
            </button>
          )}
          <button
            type="button"
            className={useScreenshot ? 'overlay-toggle is-on' : 'overlay-toggle'}
            onClick={() => update({ overlayScreenshot: !settings?.overlayScreenshot })}
            disabled={!vision}
            title={
              !vision
                ? "This model can't see images"
                : useScreenshot
                  ? 'Screenshot on: GameMate sees your screen'
                  : 'Screenshot off'
            }
          >
            📷
          </button>
          {history.length > 0 && (
            <button
              type="button"
              className="overlay-toggle"
              onClick={() => setHistory([])}
              disabled={thinking}
              title="New conversation"
            >
              ✕
            </button>
          )}
        </div>

        {(lastQuestion || thinking || error || voice.error) && (
          <div className="overlay-body">
            {lastQuestion && (
              <div className="overlay-question">
                {lastQuestion.images?.length ? '📷 ' : ''}
                {lastQuestion.content}
              </div>
            )}
            {thinking && <div className="overlay-pending">Thinking…</div>}
            {!thinking && lastAnswer && (
              <div className="overlay-answer">
                {lastAnswer.content}
                {lastAnswer.recipes?.map((r, i) => (
                  <RecipeCard key={i} recipe={r} />
                ))}
                <Sources sources={lastAnswer.sources} />
              </div>
            )}
            {(error || voice.error) && <div className="overlay-error">{error ?? voice.error}</div>}
          </div>
        )}
        <div className="overlay-footer">
          {settings?.answersEngine === 'gemini' && (
            <span className="overlay-cloud" title="Answers come from Gemini (Google)">
              ☁ Gemini ·{' '}
            </span>
          )}
          Enter to ask{voice.ready ? ` · ${appVoiceShortcut} to talk` : ''} · Esc to hide
        </div>
      </div>
    </div>
  )
}

export default Overlay
