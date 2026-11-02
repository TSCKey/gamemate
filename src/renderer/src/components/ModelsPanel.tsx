import { useState } from 'react'
import type { LocalModelStatus, ModelInfo, Settings } from '../../../preload/index.d'
import { formatSize } from '../hooks/useLocalModels'
import { Field, Section, Toggle } from './ui'

export function Progress({ value }: { value: number }): React.JSX.Element {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div className="progress-bar" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

function ModelsPanel({
  settings,
  update,
  localModels,
  ollamaModels,
  ollamaError,
  reloadOllama,
  onOpenAi
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  localModels: LocalModelStatus[]
  ollamaModels: ModelInfo[]
  ollamaError: string | null
  reloadOllama: () => void
  onOpenAi: () => void
}): React.JSX.Element {
  // Deleting means downloading again, so it takes a second click.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const inUse = (id: string): boolean =>
    settings.localBackend === 'builtin' && settings.builtinModel === id
  const use = (id: string): void =>
    update({
      localBackend: 'builtin',
      builtinModel: id,
      // Choosing a model to use also means using it for questions (Auto keeps deciding).
      ...(settings.answersEngine === 'gemini' ? { answersEngine: 'local' as const } : {})
    })

  return (
    <>
      <Section
        title="AI models on this PC"
        description="They run on your graphics card and work offline: nothing you ask leaves this PC. The first download also installs GameMate's AI engine (37 MB)."
      >
        {localModels.map((m, i) => (
          <div key={m.id} className="model-row">
            <div className="model-info">
              <div className="field-label">
                {m.name} <span className="badge">{m.label}</span>
                {i === 0 && <span className="badge is-accent">Recommended</span>}
              </div>
              <div className="field-help">
                {m.description} {formatSize(m.sizeMb)}. Can see screenshots.
              </div>
              {m.progress !== null && <Progress value={m.progress} />}
              {m.error && <div className="error-text">{m.error}</div>}
            </div>
            <div className="model-actions">
              {m.progress !== null ? (
                <>
                  <span className="field-help">{Math.round(m.progress * 100)}%</span>
                  <button type="button" onClick={() => window.api.localModels.cancel(m.id)}>
                    Cancel
                  </button>
                </>
              ) : confirmDelete === m.id ? (
                <>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setConfirmDelete(null)
                      window.api.localModels.remove(m.id)
                    }}
                  >
                    Delete {formatSize(m.sizeMb)}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </button>
                </>
              ) : m.installed ? (
                <>
                  {inUse(m.id) ? (
                    <span className="in-use">✓ In use</span>
                  ) : (
                    <button type="button" className="primary" onClick={() => use(m.id)}>
                      Use
                    </button>
                  )}
                  <button type="button" onClick={() => setConfirmDelete(m.id)}>
                    Delete
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={i === 0 ? 'primary' : ''}
                  onClick={() => window.api.localModels.download(m.id)}
                >
                  {m.error ? 'Try again' : 'Download'}
                </button>
              )}
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Ollama"
        description="Already use Ollama? GameMate can use its models instead of the built-in ones."
      >
        <Field
          label="Use my Ollama models"
          help="Ollama must be running. GameMate frees its model when GameMate quits."
        >
          <Toggle
            label="Use my Ollama models"
            checked={settings.localBackend === 'ollama'}
            onChange={(on) => update({ localBackend: on ? 'ollama' : 'builtin' })}
          />
        </Field>
        {settings.localBackend === 'ollama' && (
          <Field
            label="Model"
            help={
              ollamaError ? (
                <span className="error-text">{ollamaError}</span>
              ) : (
                'Models marked 👁 can see screenshots.'
              )
            }
          >
            <div className="button-row">
              <select
                value={settings.model}
                onChange={(e) => update({ model: e.target.value })}
                disabled={ollamaModels.length === 0}
                aria-label="Ollama model"
              >
                {ollamaModels.length === 0 && <option value="">No models</option>}
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.vision ? ' 👁' : ''}
                  </option>
                ))}
              </select>
              <button type="button" onClick={reloadOllama} title="Reload" aria-label="Reload">
                ↻
              </button>
            </div>
          </Field>
        )}
      </Section>

      <Section
        title="Cloud models"
        description="Run on another company's servers. Each one asks for your agreement before anything is sent."
      >
        <Field
          label="Google Gemini"
          help="Smarter answers and better screen understanding, with your own Google API key."
        >
          <button type="button" onClick={onOpenAi}>
            Set up
          </button>
        </Field>
      </Section>
    </>
  )
}

export default ModelsPanel
