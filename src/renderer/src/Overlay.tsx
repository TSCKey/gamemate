import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../preload/index.d'
import RecipeCard from './components/RecipeCard'
import { errorMessage, useSettings } from './useSettings'

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

  const model = settings?.model ?? ''
  // In "Disabled" mode GameMate doesn't look at the screen at all.
  const vision =
    (models.find((m) => m.name === model)?.vision ?? false) &&
    settings?.companionMode !== 'disabled'
  const useScreenshot = vision && (settings?.overlayScreenshot ?? false)
  const lastQuestion = [...history].reverse().find((m) => m.role === 'user')
  const lastAnswer = history.at(-1)?.role === 'assistant' ? history.at(-1) : undefined

  useEffect(
    () =>
      window.api.overlay.onShown(() => {
        if (Date.now() - lastActivity.current > FRESH_CONVERSATION_MS) {
          setHistory([])
          setError(null)
        }
        inputRef.current?.focus()
        inputRef.current?.select()
      }),
    []
  )

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

  const send = async (): Promise<void> => {
    const content = input.trim()
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
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setThinking(false)
      lastActivity.current = Date.now()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    } else if (e.key === 'Escape') {
      window.api.overlay.hide()
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
            placeholder={model ? 'Ask GameMate…' : 'Open GameMate and pick a model first'}
            disabled={!model}
            autoFocus
          />
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

        {(lastQuestion || thinking || error) && (
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
              </div>
            )}
            {error && <div className="overlay-error">{error}</div>}
          </div>
        )}
        <div className="overlay-footer">Enter to ask · Esc to hide</div>
      </div>
    </div>
  )
}

export default Overlay
