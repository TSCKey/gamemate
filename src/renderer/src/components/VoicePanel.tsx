import { useEffect, useState } from 'react'
import type {
  AppInfo,
  Settings,
  SpeakAnswers,
  SpeechModelId,
  SpeechModelStatus
} from '../../../preload/index.d'
import { speak } from '../voice/speak'
import { Field, Section, Toggle } from './ui'

const MODEL_LABELS: Record<SpeechModelId, string> = {
  fast: 'Fast',
  accurate: 'Accurate'
}

const MODEL_HELP: Record<SpeechModelId, string> = {
  fast: 'Quicker, but mishears more often.',
  accurate: 'A little slower, but mishears less. Recommended.'
}

const SPEAK_OPTIONS: { value: SpeakAnswers; label: string }[] = [
  { value: 'off', label: 'Never' },
  { value: 'voice', label: 'When I ask by voice' },
  { value: 'always', label: 'Always' }
]

function VoicePanel({
  settings,
  update,
  appInfo
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  appInfo: AppInfo | null
}): React.JSX.Element {
  const [models, setModels] = useState<SpeechModelStatus[]>([])
  const [voices, setVoices] = useState<string[]>([])

  useEffect(() => {
    window.api.voice.models().then(setModels)
    window.api.voice.voices().then(setVoices)
    return window.api.voice.onModels(setModels)
  }, [])

  const selected = models.find((m) => m.id === settings.speechModel)

  return (
    <>
      <Section
        title="Talk to GameMate"
        description="Speech is turned into text on this PC. Your voice never leaves it."
      >
        <Field
          label="Ask with your microphone"
          help={
            settings.voiceInput && appInfo?.voiceShortcutRegistered === false
              ? `${appInfo.voiceShortcut} is used by another app. Use the 🎤 button instead.`
              : `In a game, press ${appInfo?.voiceShortcut ?? 'Alt+V'} and ask out loud. GameMate stops listening when you pause.`
          }
        >
          <Toggle
            label="Ask with your microphone"
            checked={settings.voiceInput}
            onChange={(voiceInput) => update({ voiceInput })}
          />
        </Field>
        {settings.voiceInput && (
          <>
            {models.map((m) => (
              <Field
                key={m.id}
                label={
                  <label className="check">
                    <input
                      type="radio"
                      name="speech-model"
                      checked={settings.speechModel === m.id}
                      onChange={() => update({ speechModel: m.id })}
                    />
                    {MODEL_LABELS[m.id]} speech model
                    <span className="field-help">{m.sizeMb} MB</span>
                  </label>
                }
                help={m.error ? <span className="error-text">{m.error}</span> : MODEL_HELP[m.id]}
              >
                {m.progress !== null ? (
                  <span className="field-help">Downloading… {Math.round(m.progress * 100)}%</span>
                ) : m.installed ? (
                  <button type="button" onClick={() => window.api.voice.remove(m.id)}>
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => window.api.voice.download(m.id)}
                  >
                    Download
                  </button>
                )}
              </Field>
            ))}
            {!selected?.installed && (
              <p className="field-help">
                Download the selected model once to start. After that it works offline.
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="GameMate's voice" description="Uses the voices built into Windows.">
        <Field label="Read answers aloud">
          <select
            value={settings.speakAnswers}
            onChange={(e) => update({ speakAnswers: e.target.value as SpeakAnswers })}
          >
            {SPEAK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Read companion comments aloud">
          <Toggle
            label="Read companion comments aloud"
            checked={settings.speakComments}
            onChange={(speakComments) => update({ speakComments })}
          />
        </Field>
        <Field label="Voice">
          <select
            value={settings.voiceName}
            onChange={(e) => update({ voiceName: e.target.value })}
          >
            <option value="">Windows default</option>
            {voices.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceVolume}
            aria-label="Volume"
            onChange={(e) => update({ voiceVolume: Number(e.target.value) })}
          />
        </Field>
        <Field label="Speed">
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.voiceRate}
            aria-label="Speed"
            onChange={(e) => update({ voiceRate: Number(e.target.value) })}
          />
        </Field>
        <Field label="Try it">
          <button type="button" onClick={() => speak("Hi, I'm GameMate. Watch out for creepers!")}>
            🔊 Test voice
          </button>
        </Field>
      </Section>
    </>
  )
}

export default VoicePanel
