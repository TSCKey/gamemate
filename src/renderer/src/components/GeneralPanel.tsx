import type { AppInfo, ModelInfo, Settings } from '../../../preload/index.d'
import { Field, Section, Toggle } from './ui'

function GeneralPanel({
  settings,
  update,
  models,
  modelError,
  reloadModels,
  versions,
  appInfo
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  models: ModelInfo[]
  modelError: string | null
  reloadModels: () => void
  versions: string[]
  appInfo: AppInfo | null
}): React.JSX.Element {
  return (
    <>
      <Section title="Game">
        <Field label="Minecraft version" help="Recipes are shown for this version.">
          <select
            value={settings.minecraftVersion}
            onChange={(e) => update({ minecraftVersion: e.target.value })}
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                Minecraft {v}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title="Local AI model"
        description="The Ollama model that runs on this PC. Models marked 👁 can see screenshots."
      >
        <Field
          label="Model"
          help={modelError ? <span className="error-text">{modelError}</span> : undefined}
        >
          <div className="button-row">
            <select
              value={settings.model}
              onChange={(e) => update({ model: e.target.value })}
              disabled={models.length === 0}
            >
              {models.length === 0 && <option value="">No models</option>}
              {models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                  {m.vision ? ' 👁' : ''}
                </option>
              ))}
            </select>
            <button type="button" onClick={reloadModels} title="Reload models" aria-label="Reload">
              ↻
            </button>
          </div>
        </Field>
      </Section>

      <Section title="In-game window">
        <Field
          label="Shortcut"
          help={
            appInfo?.shortcutRegistered === false
              ? 'Another app is using this shortcut, so it is off. Close that app and restart GameMate.'
              : 'Opens a small window over your game to ask a question.'
          }
        >
          <kbd>{appInfo?.shortcut ?? 'Alt+Space'}</kbd>
        </Field>
        <Field
          label="Send a screenshot with questions"
          help="Lets GameMate see what you're looking at when you ask from the game."
        >
          <Toggle
            label="Send a screenshot with questions"
            checked={settings.overlayScreenshot}
            onChange={(overlayScreenshot) => update({ overlayScreenshot })}
          />
        </Field>
      </Section>
    </>
  )
}

export default GeneralPanel
