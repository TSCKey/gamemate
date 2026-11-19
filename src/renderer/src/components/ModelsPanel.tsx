import { useState } from 'react'
import type { LocalModelStatus, ModelInfo, Settings } from '../../../preload/index.d'
import { Trans } from 'react-i18next'
import { formatSize, useCommentaryModel } from '../hooks/useLocalModels'
import { LINKS } from '../constants'
import { ExternalLink, Field, Section, Toggle } from './ui'
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

// The fine-tuned model that writes the companion's comments, beside the main model.
function CommentaryWriter({
  model,
  settings,
  update,
  confirmDelete,
  setConfirmDelete
}: {
  model: LocalModelStatus
  settings: Settings
  update: (patch: Partial<Settings>) => void
  confirmDelete: boolean
  setConfirmDelete: (on: boolean) => void
}): React.JSX.Element {
  // Why it isn't writing right now, when it is turned on.
  const notNow =
    settings.commentaryEngine !== 'local'
      ? t('modelsPanel.commentaryGemini')
      : (settings.language || 'en') !== 'en'
        ? t('modelsPanel.commentaryEnglishOnly')
        : null
  return (
    <Section
      title={t('modelsPanel.commentaryWriter')}
      description={t('modelsPanel.commentaryWriterIntro')}
    >
      <div className="model-row">
        <div className="model-info">
          <div className="field-label">
            {model.name} <span className="badge">{model.label}</span>
          </div>
          <div className="field-help">
            {t('modelsPanel.commentaryDetails', {
              description: model.description,
              size: formatSize(model.sizeMb)
            })}
          </div>
          {model.progress !== null && <Progress value={model.progress} />}
          {model.error && <div className="error-text">{model.error}</div>}
        </div>
        <div className="model-actions">
          {model.progress !== null ? (
            <>
              <span className="field-help">{Math.round(model.progress * 100)}%</span>
              <button type="button" onClick={() => window.api.localModels.cancel(model.id)}>
                {t('modelsPanel.cancel')}
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirmDelete(false)
                  window.api.localModels.remove(model.id)
                }}
              >
                {t('modelsPanel.delete', { size: formatSize(model.sizeMb) })}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                {t('modelsPanel.keep')}
              </button>
            </>
          ) : model.installed ? (
            <button type="button" onClick={() => setConfirmDelete(true)}>
              {t('modelsPanel.delete', { size: formatSize(model.sizeMb) })}
            </button>
          ) : (
            <button type="button" onClick={() => window.api.localModels.download(model.id)}>
              {model.error ? t('modelsPanel.tryAgain') : t('modelsPanel.download')}
            </button>
          )}
        </div>
      </div>
      {model.installed && (
        <Field
          label={t('modelsPanel.useCommentaryModel')}
          help={
            settings.commentaryModel && notNow ? notNow : t('modelsPanel.useCommentaryModelHelp')
          }
        >
          <Toggle
            label={t('modelsPanel.useCommentaryModel')}
            checked={settings.commentaryModel}
            onChange={(on) => update({ commentaryModel: on })}
          />
        </Field>
      )}
      <p className="field-help">
        <Trans
          i18nKey="modelsPanel.commentaryLicense"
          components={{ license: <ExternalLink href={LINKS.lfmLicense} /> }}
        />
      </p>
    </Section>
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
  const commentaryModel = useCommentaryModel()

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
                    {t('modelsPanel.delete', { size: formatSize(m.sizeMb) })}
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
        <Field
          label={t('modelsPanel.saveGraphicsMemory')}
          help={t('modelsPanel.saveGraphicsMemoryHelp')}
        >
          <Toggle
            label={t('modelsPanel.saveGraphicsMemory')}
            checked={settings.saveGraphicsMemory}
            onChange={(on) => update({ saveGraphicsMemory: on })}
          />
        </Field>
      </Section>

      {commentaryModel && (
        <CommentaryWriter
          model={commentaryModel}
          settings={settings}
          update={update}
          confirmDelete={confirmDelete === commentaryModel.id}
          setConfirmDelete={(on) => setConfirmDelete(on ? commentaryModel.id : null)}
        />
      )}

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
