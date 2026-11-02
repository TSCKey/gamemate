import { useEffect, useState } from 'react'
import type {
  AppInfo,
  Settings,
  ListenModelId,
  SpeakAnswers,
  SpeechModelStatus
} from '../../../preload/index.d'
import { speak } from '../voice/speak'
import { Field, Section, Toggle } from './ui'

const MODEL_LABELS: Record<ListenModelId, string> = {
  fast: 'Fast',
  accurate: 'Accurate',
  best: 'Best'
}

const MODEL_HELP: Record<ListenModelId, string> = {
  fast: 'Quickest, but mishears more often.',
  accurate: 'Mishears less than Fast.',
  best: 'Whisper Small: understands you best, also with accents, but takes a few seconds longer. Recommended.'
}

// Kokoro's English voices: a = American, b = British, f = female, m = male.
const KOKORO_VOICES = [
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_alice',
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
  'bm_george',
  'bm_lewis'
]

function voiceLabel(id: string): string {
  const name = id.slice(3)
  const accent = id[0] === 'a' ? 'American' : 'British'
  const kind = id[1] === 'f' ? 'female' : 'male'
  return `${name[0].toUpperCase()}${name.slice(1)} (${accent}, ${kind})`
}

// Download, progress and remove for one model.
function ModelButton({ model }: { model: SpeechModelStatus }): React.JSX.Element {
  if (model.progress !== null) {
    return <span className="field-help">Downloading… {Math.round(model.progress * 100)}%</span>
  }
  return model.installed ? (
    <button type="button" onClick={() => window.api.voice.remove(model.id)}>
      Remove
    </button>
  ) : (
    <button type="button" className="primary" onClick={() => window.api.voice.download(model.id)}>
      Download
    </button>
  )
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

  const listen = models.filter((m) => m.kind === 'listen')
  const kokoro = models.find((m) => m.id === 'kokoro')
  const selected = models.find((m) => m.id === settings.speechModel)
  const natural = settings.voiceEngine === 'kokoro'

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
              : `In a game, press ${settings.voiceShortcut} and ask out loud. GameMate stops listening when you pause.`
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
            {listen.map((m) => (
              <Field
                key={m.id}
                label={
                  <label className="check">
                    <input
                      type="radio"
                      name="speech-model"
                      checked={settings.speechModel === m.id}
                      onChange={() => update({ speechModel: m.id as ListenModelId })}
                    />
                    {MODEL_LABELS[m.id as ListenModelId]} speech model
                    <span className="field-help">{m.sizeMb} MB</span>
                  </label>
                }
                help={
                  m.error ? (
                    <span className="error-text">{m.error}</span>
                  ) : (
                    MODEL_HELP[m.id as ListenModelId]
                  )
                }
              >
                <ModelButton model={m} />
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

      <Section
        title="GameMate's voice"
        description={
          natural
            ? 'Kokoro, a natural-sounding voice that runs on this PC and works offline.'
            : 'Uses the voices built into Windows.'
        }
      >
        <Field
          label="Voice type"
          help="Natural is Kokoro (Apache 2.0, trained only on permissive, non-copyrighted audio): a one-time download, then it works offline."
        >
          <select
            value={settings.voiceEngine}
            onChange={(e) => update({ voiceEngine: e.target.value as Settings['voiceEngine'] })}
            aria-label="Voice type"
          >
            <option value="kokoro">Natural (Kokoro)</option>
            <option value="windows">Windows voices</option>
          </select>
        </Field>
        {natural && kokoro && (
          <Field
            label={
              <>
                Natural voice <span className="field-help">{kokoro.sizeMb} MB</span>
              </>
            }
            help={
              kokoro.error ? (
                <span className="error-text">{kokoro.error}</span>
              ) : kokoro.installed ? (
                'Downloaded.'
              ) : (
                'Download it once to use it. Until then, GameMate uses a Windows voice.'
              )
            }
          >
            <ModelButton model={kokoro} />
          </Field>
        )}
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
          {natural ? (
            <select
              value={settings.kokoroVoice}
              onChange={(e) => update({ kokoroVoice: e.target.value })}
              aria-label="Voice"
            >
              {KOKORO_VOICES.map((v) => (
                <option key={v} value={v}>
                  {voiceLabel(v)}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={settings.voiceName}
              onChange={(e) => update({ voiceName: e.target.value })}
              aria-label="Voice"
            >
              <option value="">Windows default</option>
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
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
