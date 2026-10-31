import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppInfo, CaptureSource, ChatMessage } from '../../preload/index.d'
import RecipeCard from './components/RecipeCard'
import { errorMessage, useSettings } from './useSettings'

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
  const [versions, setVersions] = useState<string[]>([])
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'capturing' | 'thinking'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [sourceId, setSourceId] = useState('')
  const [attachScreenshot, setAttachScreenshot] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const model = settings?.model ?? ''
  const loading = status !== 'idle'
  const visionModel = models.find((m) => m.name === model)?.vision ?? false
  const willAttach = attachScreenshot && visionModel && sourceId !== ''
  const screenCount = sources.filter((s) => s.type === 'screen').length
  const shownError = error ?? modelError

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the IPC call resolves
    loadSources()
    // Windows open and close while GameMate is in the background; refresh when it regains focus.
    window.addEventListener('focus', loadSources)
    return () => window.removeEventListener('focus', loadSources)
  }, [loadSources])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const send = async (text: string = input, withScreenshot = willAttach): Promise<void> => {
    const typed = text.trim()
    if (!model || loading || (!typed && !withScreenshot)) return

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
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setStatus('idle')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <h1>GameMate</h1>
        <div className="model-picker">
          <select
            value={settings?.minecraftVersion ?? ''}
            onChange={(e) => update({ minecraftVersion: e.target.value })}
            aria-label="Minecraft version"
            title="Minecraft version"
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                Minecraft {v}
              </option>
            ))}
          </select>
          <select
            value={model}
            onChange={(e) => update({ model: e.target.value })}
            disabled={models.length === 0}
            aria-label="Model"
          >
            {models.length === 0 && <option value="">No models</option>}
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {m.vision ? ' 👁' : ''}
              </option>
            ))}
          </select>
          <button type="button" onClick={reloadModels} title="Reload models">
            ↻
          </button>
          <button type="button" onClick={() => setMessages([])} disabled={loading}>
            New chat
          </button>
        </div>
      </header>

      <main className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <p>Ask anything to get started.</p>
            {appInfo &&
              (appInfo.shortcutRegistered ? (
                <p className="chat-hint">
                  Tip: press <kbd>{appInfo.shortcut}</kbd> in any game to ask without leaving it.
                </p>
              ) : (
                <p className="chat-hint">
                  <kbd>{appInfo.shortcut}</kbd> is used by another app, so the in-game shortcut is
                  off. Close that app and restart GameMate.
                </p>
              ))}
            {visionModel && sourceId && (
              <button
                type="button"
                onClick={() => {
                  setAttachScreenshot(true)
                  send(DEFAULT_SCREEN_QUESTION, true)
                }}
              >
                📷 What&apos;s on my screen?
              </button>
            )}
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
          </div>
        ))}
        {loading && (
          <div className="bubble bubble-assistant bubble-pending">
            {status === 'capturing' ? 'Capturing screen…' : 'Thinking…'}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {shownError && <div className="chat-error">{shownError}</div>}

      <div className="capture-bar">
        <label className={visionModel ? '' : 'is-disabled'}>
          <input
            type="checkbox"
            checked={attachScreenshot && visionModel}
            onChange={(e) => setAttachScreenshot(e.target.checked)}
            disabled={!visionModel || sources.length === 0}
          />
          Include screenshot of
        </label>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          disabled={!visionModel || sources.length === 0}
          aria-label="Screenshot source"
        >
          {sources.length === 0 && <option value="">Nothing to capture</option>}
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {sourceLabel(s, screenCount)}
            </option>
          ))}
        </select>
        <button type="button" onClick={loadSources} title="Refresh window list">
          ↻
        </button>
        {!visionModel && model && (
          <span className="capture-hint">This model can&apos;t see images.</span>
        )}
      </div>

      <form
        className="chat-input"
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
            !model
              ? 'Select a model first'
              : willAttach
                ? 'Ask about your screen… (or just press Enter)'
                : `Message ${model}…`
          }
          rows={2}
          disabled={!model}
        />
        <button type="submit" disabled={!model || loading || (!input.trim() && !willAttach)}>
          Send
        </button>
      </form>
    </div>
  )
}

export default App
