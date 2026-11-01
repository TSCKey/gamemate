import { useState } from 'react'
import type { LocalModelStatus, ModelInfo, Settings } from '../../../preload/index.d'
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from './Menu'

// Gemini variants that can't chat (image, speech, embeddings…) aren't worth listing here.
const CHAT_GEMINI = (name: string): boolean =>
  !/image|tts|live|audio|embed|native|learnlm|robotics|computer-use/.test(name)
const MAX_GEMINI_CHOICES = 6

// Small picker under the question box: Auto, a model on this PC (built-in or Ollama), or Gemini.
function ModelMenu({
  settings,
  update,
  models,
  localModels,
  onOpenSettings
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  // Ollama's models, if Ollama is running.
  models: ModelInfo[]
  localModels: LocalModelStatus[]
  onOpenSettings: (tab: 'models' | 'ai') => void
}): React.JSX.Element {
  // Loaded when the menu opens, so Google isn't asked for the list on every start.
  const [gemini, setGemini] = useState<{ hasKey: boolean; models: string[] } | null>(null)

  const loadGemini = async (): Promise<void> => {
    if (!settings.geminiConsent) {
      setGemini({ hasKey: false, models: [] })
      return
    }
    const { hasKey } = await window.api.gemini.status()
    const list = hasKey ? await window.api.gemini.models().catch(() => []) : []
    setGemini({ hasKey, models: list })
  }

  const engine = settings.answersEngine
  // Settings may already say Gemini is usable before the menu has asked for the key status.
  const geminiReady = settings.geminiConsent && (gemini?.hasKey ?? Boolean(settings.geminiModel))
  const geminiChoices = [
    settings.geminiModel,
    ...(gemini?.models ?? []).filter((m) => CHAT_GEMINI(m) && m !== settings.geminiModel)
  ]
    .filter(Boolean)
    .slice(0, MAX_GEMINI_CHOICES)
  const installed = localModels.filter((m) => m.installed)
  const builtinName = localModels.find((m) => m.id === settings.builtinModel)?.name ?? 'Built-in AI'

  const label =
    engine === 'auto'
      ? '✦ Auto'
      : engine === 'gemini'
        ? `☁ ${settings.geminiModel || 'Gemini'}`
        : settings.localBackend === 'builtin'
          ? builtinName
          : settings.model || 'Choose a model'

  return (
    <Dropdown
      label={<span className="model-trigger-text">{label}</span>}
      menuLabel="Which AI answers"
      title="Which AI answers your questions"
      triggerClassName="model-trigger"
      align="end"
      direction="up"
      onOpen={loadGemini}
    >
      <>
        <MenuItem
          title="✦ Auto"
          description={
            geminiReady
              ? 'Picks this PC or Gemini for each question'
              : 'Picks this PC or Gemini for each question. Set up Gemini first.'
          }
          checked={engine === 'auto'}
          disabled={!geminiReady}
          onSelect={() => update({ answersEngine: 'auto' })}
        />
        <MenuSeparator />
        <MenuLabel>On this PC</MenuLabel>
        {installed.map((m) => (
          <MenuItem
            key={m.id}
            title={m.name}
            description={`${m.label} · Can see screenshots`}
            checked={
              engine === 'local' &&
              settings.localBackend === 'builtin' &&
              settings.builtinModel === m.id
            }
            onSelect={() =>
              update({ answersEngine: 'local', localBackend: 'builtin', builtinModel: m.id })
            }
          />
        ))}
        {installed.length === 0 && (
          <MenuItem
            title="Download a model…"
            description="Runs on your graphics card, works offline"
            onSelect={() => onOpenSettings('models')}
          />
        )}
        {models.length > 0 && (
          <>
            <MenuLabel>Ollama</MenuLabel>
            {models.map((m) => (
              <MenuItem
                key={m.name}
                title={m.name}
                description={m.vision ? 'Can see screenshots' : 'Text only'}
                checked={
                  engine === 'local' &&
                  settings.localBackend === 'ollama' &&
                  settings.model === m.name
                }
                onSelect={() =>
                  update({ answersEngine: 'local', localBackend: 'ollama', model: m.name })
                }
              />
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuLabel>Gemini (cloud)</MenuLabel>
        {geminiReady ? (
          geminiChoices.map((m) => (
            <MenuItem
              key={m}
              title={m}
              checked={engine === 'gemini' && settings.geminiModel === m}
              onSelect={() => update({ answersEngine: 'gemini', geminiModel: m })}
            />
          ))
        ) : (
          <MenuItem
            title="Set up Gemini…"
            description="Smarter answers with your own Google API key"
            onSelect={() => onOpenSettings('ai')}
          />
        )}
        <MenuSeparator />
        <MenuItem title="Manage models…" onSelect={() => onOpenSettings('models')} />
      </>
    </Dropdown>
  )
}

export default ModelMenu
