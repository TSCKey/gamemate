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
import { t, useAppLanguage } from '../i18n'
import { withLatestScreenshotOnly } from '../../../shared/chat'

// Reopening after this long starts a new conversation instead of continuing the old one.
const FRESH_CONVERSATION_MS = 10 * 60 * 1000
// Transparent space around the panel, so its shadow isn't clipped by the window edge.
const WINDOW_PADDING = 24

function Overlay(): React.JSX.Element {
  const { settings, models, update } = useSettings()
  useAppLanguage(settings)
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
  // The AI model starts loading when the player begins a question (first key press, or the
  // microphone), once each time the window is opened: opening and closing it loads nothing.
  const warmed = useRef(false)
  const warmUp = (): void => {
    if (warmed.current) return
    warmed.current = true
    window.api.overlay.warmUp()
  }

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
        warmed.current = false
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

  // The question being answered, so ■ can take it back: the conversation as it was and the text.
  const asking = useRef<{ before: ChatMessage[]; text: string } | null>(null)

  const send = async (text: string = input, byVoice = false): Promise<void> => {
    const content = text.trim()
    if (!content || !model || thinking) return

    const mine = { before: history, text }
    asking.current = mine
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
      if (asking.current !== mine) return
      setHistory(next)
      setInput('')
      const reply = await window.api.ask(withLatestScreenshotOnly(next), setWritten)
      // Stopped with ■ meanwhile: the conversation is already back to how it was.
      if (asking.current !== mine) return
      setHistory([...next, reply])
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
        setThinking(false)
      }
      lastActivity.current = Date.now()
    }
  }

  // ■: the answer stops, the question goes back into the box to fix it.
  const stop = (): void => {
    const stopped = asking.current
    if (!stopped) return
    asking.current = null
    window.api.stopAsking()
    setHistory(stopped.before)
    setInput(stopped.text)
    setWritten('')
    setThinking(false)
    inputRef.current?.focus()
  }

  // Spoken questions are sent as soon as they're transcribed.
  const voice = useVoiceInput(settings, (text) => send(text, true))
  const listen = (): void => {
    warmUp()
    voice.toggle()
  }
  useEffect(() => {
    listenRef.current = listen
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
          <span className="overlay-handle" title={t('overlay.dragToMove')}>
            🎮
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (e.target.value) warmUp()
            }}
            onKeyDown={onKeyDown}
            placeholder={
              !model
                ? t('overlay.openGamemateAndSetUp')
                : voice.status === 'listening'
                  ? t('overlay.listening')
                  : voice.status === 'transcribing'
                    ? t('overlay.workingOutWhatYouSaid')
                    : t('overlay.askGamemate')
            }
            disabled={!model || voice.status !== 'idle'}
            autoFocus
          />
          {thinking && (
            <button
              type="button"
              className="overlay-toggle overlay-stop"
              onClick={stop}
              title={t('app.stop')}
              aria-label={t('app.stop')}
            >
              ■
            </button>
          )}
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
              onClick={listen}
              disabled={!model || voice.status === 'transcribing' || thinking}
              title={
                voice.status === 'listening'
                  ? t('overlay.listeningClickToStop')
                  : t('overlay.askByVoice', { voiceShortcut })
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
                ? t('overlay.thisModelCanTSee')
                : useScreenshot
                  ? t('overlay.screenshotOnGamemateSeesYour')
                  : t('overlay.screenshotOff')
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
              title={t('overlay.newConversation')}
            >
              ✕
            </button>
          )}
        </div>

        {(lastQuestion || thinking || error || voice.error) && (
          <div className="overlay-body">
            {lastQuestion && (
              <div className="overlay-question" dir="auto">
                {lastQuestion.images?.length ? '📷 ' : ''}
                {lastQuestion.content}
              </div>
            )}
            {thinking && written && (
              <div className="overlay-answer" dir="auto">
                {written}
              </div>
            )}
            {thinking && !written && <div className="overlay-pending">{t('overlay.thinking')}</div>}
            {!thinking && lastAnswer && (
              <div className="overlay-answer" dir="auto">
                {lastAnswer.content}
                {lastAnswer.recipes?.map((r, i) => (
                  <RecipeCard key={i} recipe={r} />
                ))}
                <Pictures pictures={lastAnswer.pictures} />
                <Sources sources={lastAnswer.sources} />
                <SearchSuggestions html={lastAnswer.searchSuggestions} />
              </div>
            )}
            {(error || voice.error) && <div className="overlay-error">{error ?? voice.error}</div>}
          </div>
        )}
        <div className="overlay-footer">
          {engine === 'gemini' && (
            <span className="overlay-cloud" title={t('overlay.answersComeFromGeminiGoogle')}>
              ☁ Gemini ·{' '}
            </span>
          )}
          {engine === 'auto' && (
            <span className="overlay-cloud" title={t('overlay.gamematePicksTheLocalAi')}>
              {lastAnswer?.answeredBy
                ? lastAnswer.answeredBy.provider === 'gemini'
                  ? t('overlay.autoGemini')
                  : t('overlay.autoThisPc')
                : t('overlay.auto')}{' '}
              ·{' '}
            </span>
          )}
          {gameName && <span title={t('overlay.theGameGamemateHelpsWith')}>{gameName} · </span>}
          {voice.ready ? t('overlay.hintWithVoice', { voiceShortcut }) : t('overlay.hint')}
        </div>
      </div>
    </div>
  )
}

export default Overlay
