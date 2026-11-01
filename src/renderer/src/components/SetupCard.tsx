import type { LocalModelStatus, Settings } from '../../../preload/index.d'
import { formatSize } from '../useLocalModels'
import { Progress } from './ModelsPanel'

// First start: GameMate's own AI isn't downloaded yet. One click gets it.
function SetupCard({
  models,
  update,
  onOpenModels,
  onOpenAi
}: {
  models: LocalModelStatus[]
  update: (patch: Partial<Settings>) => void
  onOpenModels: () => void
  onOpenAi: () => void
}): React.JSX.Element | null {
  const first = models[0]
  const downloading = models.find((m) => m.progress !== null)
  const failed = models.find((m) => m.error)
  if (!first) return null

  return (
    <div className="setup-card">
      <h2>Download GameMate&apos;s AI</h2>
      <p>
        One download and GameMate runs on this PC, even offline. Nothing you ask leaves your
        computer.
      </p>
      {downloading ? (
        <div className="setup-progress">
          <Progress value={downloading.progress ?? 0} />
          <div className="setup-progress-row">
            <span className="field-help">
              Downloading {downloading.name}: {Math.round((downloading.progress ?? 0) * 100)}% of{' '}
              {formatSize(downloading.sizeMb)}
            </span>
            <button type="button" onClick={() => window.api.localModels.cancel(downloading.id)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="primary setup-download"
          onClick={() => window.api.localModels.download(first.id)}
        >
          Download {first.name} ({formatSize(first.sizeMb)})
        </button>
      )}
      {failed && !downloading && <p className="error-text">{failed.error}</p>}
      <div className="setup-links">
        <button type="button" className="link" onClick={onOpenModels}>
          Other models
        </button>
        <button type="button" className="link" onClick={() => update({ localBackend: 'ollama' })}>
          I use Ollama
        </button>
        <button type="button" className="link" onClick={onOpenAi}>
          Use Gemini (cloud)
        </button>
      </div>
    </div>
  )
}

export default SetupCard
