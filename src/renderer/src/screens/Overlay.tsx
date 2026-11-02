import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../../preload/index.d'
import RecipeCard from '../components/RecipeCard'
import Pictures from '../components/Pictures'
import SearchSuggestions from '../components/SearchSuggestions'
import Sources from '../components/Sources'
import { errorMessage, useSettings } from '../hooks/useSettings'
import { localModelInfo, useLocalModels } from '../hooks/useLocalModels'
import { useGames } from '../hooks/useGames'
import { speak, stopSpeaking } from '../voice/speak'
import { useVoiceInput } from '../voice/useVoiceInput'

// Reopening after this long starts a new conversation instead of continuing the old one.
const FRESH_CONVERSATION_MS = 10 * 60 * 1000
// Transparent space around the panel, so its shadow isn't clipped by the window edge.
const WINDOW_PADDING = 24

function Overlay(): React.JSX.Element {
  const { settings, models, update } = useSettings()
  const voiceShortcut = settings?.voiceShortcut ?? ''
  const games = useGames(settings)
  const gameName = games?.games.find((g) => g.id === settings?.currentGame)?.name
  const localModels = useLocalModels()
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  // The answer so far, while it is being written.
  const [written, setWritten] = useState('')
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastActivity = useRef(0)

  const engine = settings?.answersEngine ?? 'local'
  const cloud = engine !== 'local'
  const local = settings ? localModelInfo(settings, localModels, models) : null
  // Whether some AI is set up to answer (Gemini or Auto can work without a local model).
  const model =
    engine === 'gemini'
      ? (settings?.geminiModel ?? '')
      : local?.ready
        ? local.name
        : engine === 'auto'
          ? (settings?.geminiModel ?? '')
          : ''
  // In "Disabled" mode GameMate doesn't look at the screen at all.
  const vision = (cloud || (local?.vision ?? false)) && settings?.companionMode !== 'disabled'
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
      const reply = await window.api.ask(next, setWritten)
      setHistory([...next, reply])
      const say = settings?.speakAnswers
      if (settings && (say === 'always' || (say === 'voice' && byVoice))) {
        speak(reply.content)
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWritten('')
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
                ? 'Open GameMate and set up an AI model first'
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
                  : `Ask by voice (${voiceShortcut})`
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
            {thinking && written && <div className="overlay-answer">{written}</div>}
            {thinking && !written && <div className="overlay-pending">Thinking…</div>}
            {!thinking && lastAnswer && (
              <div className="overlay-answer">
                {lastAnswer.content}
                {lastAnswer.recipes?.map((r, i) => (
                  <RecipeCard key={i} recipe={r} />
                ))}
                <Pictures pictures={lastAnswer.pictures} />
                <Sources sources={lastAnswer.sources} />
                <SearchSuggestions html={lastAnswer.searchSuggestions} />
                {lastAnswer.notice && <div className="answer-notice">{lastAnswer.notice}</div>}
              </div>
            )}
            {(error || voice.error) && <div className="overlay-error">{error ?? voice.error}</div>}
          </div>
        )}
        <div className="overlay-footer">
          {engine === 'gemini' && (
            <span className="overlay-cloud" title="Answers come from Gemini (Google)">
              ☁ Gemini ·{' '}
            </span>
          )}
          {engine === 'auto' && (
            <span
              className="overlay-cloud"
              title="GameMate picks the local AI or Gemini for each question"
            >
              {lastAnswer?.answeredBy
                ? `✦ Auto: ${lastAnswer.answeredBy.provider === 'gemini' ? '☁ Gemini' : 'this PC'}`
                : '✦ Auto'}{' '}
              ·{' '}
            </span>
          )}
          {gameName && <span title="The game GameMate helps with">{gameName} · </span>}
          Enter to ask{voice.ready ? ` · ${voiceShortcut} to talk` : ''} · Esc to hide
        </div>
      </div>
    </div>
  )
}

export default Overlay
