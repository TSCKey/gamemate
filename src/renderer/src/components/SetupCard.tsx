import type { LocalModelStatus, Settings } from '../../../preload/index.d'
import { formatSize } from '../hooks/useLocalModels'
import { Progress } from './ModelsPanel'
import { t } from '../i18n'

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
      <h2>{t('setupCard.downloadGamemateSAi')}</h2>
      <p>{t('setupCard.oneDownloadAndGamemateRuns')}</p>
      {downloading ? (
        <div className="setup-progress">
          <Progress value={downloading.progress ?? 0} />
          <div className="setup-progress-row">
            <span className="field-help">
              {t('setupCard.downloading', {
                name: downloading.name,
                percent: Math.round((downloading.progress ?? 0) * 100),
                size: formatSize(downloading.sizeMb)
              })}
            </span>
            <button type="button" onClick={() => window.api.localModels.cancel(downloading.id)}>
              {t('setupCard.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="primary setup-download"
          onClick={() => window.api.localModels.download(first.id)}
        >
          {t('setupCard.download', { name: first.name, size: formatSize(first.sizeMb) })}
        </button>
      )}
      {failed && !downloading && <p className="error-text">{failed.error}</p>}
      <div className="setup-links">
        <button type="button" className="link" onClick={onOpenModels}>
          {t('setupCard.otherModels')}
        </button>
        <button type="button" className="link" onClick={() => update({ localBackend: 'ollama' })}>
          {t('setupCard.iUseOllama')}
        </button>
        <button type="button" className="link" onClick={onOpenAi}>
          {t('setupCard.useGeminiCloud')}
        </button>
      </div>
    </div>
  )
}

export default SetupCard
