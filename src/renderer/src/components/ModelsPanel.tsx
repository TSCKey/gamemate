import { useState } from 'react'
import type { LocalModelStatus, ModelInfo, Settings } from '../../../preload/index.d'
import { formatSize } from '../hooks/useLocalModels'
import { Field, Section, Toggle } from './ui'
import { t } from '../i18n'

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
        title={t('modelsPanel.aiModelsOnThisPc')}
        description={t('modelsPanel.theyRunOnYourGraphics')}
      >
        {localModels.map((m, i) => (
          <div key={m.id} className="model-row">
            <div className="model-info">
              <div className="field-label">
                {m.name} <span className="badge">{m.label}</span>
                {i === 0 && <span className="badge is-accent">{t('modelsPanel.recommended')}</span>}
              </div>
              <div className="field-help">
                {t('modelsPanel.modelDetails', {
                  description: m.description,
                  size: formatSize(m.sizeMb)
                })}
              </div>
              {m.progress !== null && <Progress value={m.progress} />}
              {m.error && <div className="error-text">{m.error}</div>}
            </div>
            <div className="model-actions">
              {m.progress !== null ? (
                <>
                  <span className="field-help">{Math.round(m.progress * 100)}%</span>
                  <button type="button" onClick={() => window.api.localModels.cancel(m.id)}>
                    {t('modelsPanel.cancel')}
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
                    {t('modelsPanel.delete', { size: formatSize(m.sizeMb) })}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)}>
                    {t('modelsPanel.keep')}
                  </button>
                </>
              ) : m.installed ? (
                <>
                  {inUse(m.id) ? (
                    <span className="in-use">{t('modelsPanel.inUse')}</span>
                  ) : (
                    <button type="button" className="primary" onClick={() => use(m.id)}>
                      {t('modelsPanel.use')}
                    </button>
                  )}
                  <button type="button" onClick={() => setConfirmDelete(m.id)}>
                    {t('modelsPanel.delete')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={i === 0 ? 'primary' : ''}
                  onClick={() => window.api.localModels.download(m.id)}
                >
                  {m.error ? t('modelsPanel.tryAgain') : t('modelsPanel.download')}
                </button>
              )}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Ollama" description={t('modelsPanel.alreadyUseOllamaGamemateCan')}>
        <Field
          label={t('modelsPanel.useMyOllamaModels')}
          help={t('modelsPanel.ollamaMustBeRunningGamemate')}
        >
          <Toggle
            label={t('modelsPanel.useMyOllamaModels')}
            checked={settings.localBackend === 'ollama'}
            onChange={(on) => update({ localBackend: on ? 'ollama' : 'builtin' })}
          />
        </Field>
        {settings.localBackend === 'ollama' && (
          <Field
            label={t('modelsPanel.model')}
            help={
              ollamaError ? (
                <span className="error-text">{ollamaError}</span>
              ) : (
                t('modelsPanel.modelsMarkedCanSeeScreenshots')
              )
            }
          >
            <div className="button-row">
              <select
                value={settings.model}
                onChange={(e) => update({ model: e.target.value })}
                disabled={ollamaModels.length === 0}
                aria-label={t('modelsPanel.ollamaModel')}
              >
                {ollamaModels.length === 0 && <option value="">{t('modelsPanel.noModels')}</option>}
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.vision ? ' 👁' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={reloadOllama}
                title={t('modelsPanel.reload')}
                aria-label={t('modelsPanel.reload')}
              >
                ↻
              </button>
            </div>
          </Field>
        )}
      </Section>

      <Section
        title={t('modelsPanel.cloudModels')}
        description={t('modelsPanel.runOnAnotherCompanyS')}
      >
        <Field label="Google Gemini" help={t('modelsPanel.smarterAnswersAndBetterScreen')}>
          <button type="button" onClick={onOpenAi}>
            {t('modelsPanel.setUp')}
          </button>
        </Field>
      </Section>
    </>
  )
}

export default ModelsPanel
