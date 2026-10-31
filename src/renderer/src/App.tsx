import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../preload/index.d'

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  // ipcRenderer.invoke wraps main-process errors in a generic prefix; strip it.
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function App(): React.JSX.Element {
  const [models, setModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadModels = async (): Promise<void> => {
    try {
      const names = await window.api.listModels()
      setModels(names)
      setModel((current) => (names.includes(current) ? current : (names[0] ?? '')))
      setError(names.length === 0 ? 'No models installed. Run: ollama pull llama3.2' : null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the IPC call resolves
    loadModels()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (): Promise<void> => {
    const content = input.trim()
    if (!content || !model || loading) return

    const history: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(history)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const reply = await window.api.chat(model, history)
      setMessages([...history, reply])
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
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
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={models.length === 0}
          >
            {models.length === 0 && <option value="">No models</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadModels} title="Reload models">
            ↻
          </button>
          <button type="button" onClick={() => setMessages([])} disabled={loading}>
            New chat
          </button>
        </div>
      </header>

      <main className="chat-messages">
        {messages.length === 0 && !loading && (
          <p className="chat-empty">Ask anything to get started.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble-${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="bubble bubble-assistant bubble-pending">Thinking…</div>}
        <div ref={bottomRef} />
      </main>

      {error && <div className="chat-error">{error}</div>}

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
          placeholder={model ? `Message ${model}…` : 'Select a model first'}
          rows={2}
          disabled={!model}
        />
        <button type="submit" disabled={!input.trim() || !model || loading}>
          Send
        </button>
      </form>
    </div>
  )
}

export default App
