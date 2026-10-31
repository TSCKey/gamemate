import { useEffect, useState } from 'react'
import type {
  AppInfo,
  Settings,
  SpeakAnswers,
  SpeechModelId,
  SpeechModelStatus
} from '../../../preload/index.d'
import { speak } from '../voice/speak'

const MODEL_LABELS: Record<SpeechModelId, string> = {
  fast: 'Fast',
  accurate: 'Accurate'
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
    <section className="companion voice">
      <h2>Talk to GameMate</h2>
      <label className="voice-check">
        <input
          type="checkbox"
          checked={settings.voiceInput}
          onChange={(e) => update({ voiceInput: e.target.checked })}
        />
        Ask questions with your microphone
      </label>
      {settings.voiceInput && (
        <>
          <div className="voice-models">
            {models.map((m) => (
              <div key={m.id} className="voice-model">
                <label>
                  <input
                    type="radio"
                    name="speech-model"
                    checked={settings.speechModel === m.id}
                    onChange={() => update({ speechModel: m.id })}
                  />
                  {MODEL_LABELS[m.id]} <span className="voice-dim">({m.sizeMb} MB)</span>
                </label>
                {m.progress !== null ? (
                  <span className="voice-dim">Downloading… {Math.round(m.progress * 100)}%</span>
                ) : m.installed ? (
                  <button type="button" onClick={() => window.api.voice.remove(m.id)}>
                    Remove
                  </button>
                ) : (
                  <button type="button" onClick={() => window.api.voice.download(m.id)}>
                    Download
                  </button>
                )}
                {m.error && <span className="voice-error">{m.error}</span>}
              </div>
            ))}
          </div>
          <p className="companion-help">
            {selected?.installed
              ? appInfo?.voiceShortcutRegistered === false
                ? `${appInfo.voiceShortcut} is used by another app. Use the 🎤 button instead.`
                : `In a game, press ${appInfo?.voiceShortcut ?? 'Alt+V'} and ask your question out loud. GameMate stops listening when you pause.`
              : 'Download the speech model once to start. After that it works offline, and your voice never leaves this PC.'}
          </p>
        </>
      )}

      <h2>GameMate&apos;s voice</h2>
      <div className="companion-row">
        <label>
          Read answers aloud
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
        </label>
        <label className="voice-check">
          <input
            type="checkbox"
            checked={settings.speakComments}
            onChange={(e) => update({ speakComments: e.target.checked })}
          />
          Read companion comments aloud
        </label>
      </div>
      <div className="companion-row">
        <label>
          Voice
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
        </label>
        <label>
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceVolume}
            onChange={(e) => update({ voiceVolume: Number(e.target.value) })}
          />
        </label>
        <label>
          Speed
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.voiceRate}
            onChange={(e) => update({ voiceRate: Number(e.target.value) })}
          />
        </label>
        <button type="button" onClick={() => speak("Hi, I'm GameMate. Watch out for creepers!")}>
          🔊 Test
        </button>
      </div>
    </section>
  )
}

export default VoicePanel
