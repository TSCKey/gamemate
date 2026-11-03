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
import { t } from '../i18n'

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
  return t(`voicePanel.kokoroVoice.${id.slice(0, 2)}`, {
    name: `${name[0].toUpperCase()}${name.slice(1)}`
  })
}

// Download, progress and remove for one model.
function ModelButton({ model }: { model: SpeechModelStatus }): React.JSX.Element {
  if (model.progress !== null) {
    return (
      <span className="field-help">
        {t('voicePanel.downloading', { percent: Math.round(model.progress * 100) })}
      </span>
    )
  }
  return model.installed ? (
    <button type="button" onClick={() => window.api.voice.remove(model.id)}>
      {t('voicePanel.remove')}
    </button>
  ) : (
    <button type="button" className="primary" onClick={() => window.api.voice.download(model.id)}>
      {t('voicePanel.download')}
    </button>
  )
}

const SPEAK_OPTIONS: SpeakAnswers[] = ['off', 'voice', 'always']

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
        title={t('voicePanel.talkToGamemate')}
        description={t('voicePanel.speechIsTurnedIntoText')}
      >
        <Field
          label={t('voicePanel.askWithYourMicrophone')}
          help={
            settings.voiceInput && appInfo?.voiceShortcutRegistered === false
              ? t('voicePanel.isUsedByAnotherApp', { voiceShortcut: appInfo.voiceShortcut })
              : t('voicePanel.inAGamePressAnd', { voiceShortcut: settings.voiceShortcut })
          }
        >
          <Toggle
            label={t('voicePanel.askWithYourMicrophone')}
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
                    {t(`voicePanel.speechModels.${m.id}.label`)}
                    <span className="field-help">{t('voicePanel.mb', { size: m.sizeMb })}</span>
                  </label>
                }
                help={
                  m.error ? (
                    <span className="error-text">{m.error}</span>
                  ) : (
                    t(`voicePanel.speechModels.${m.id}.help`)
                  )
                }
              >
                <ModelButton model={m} />
              </Field>
            ))}
            {!selected?.installed && (
              <p className="field-help">{t('voicePanel.downloadTheSelectedModelOnce')}</p>
            )}
          </>
        )}
      </Section>

      <Section
        title={t('voicePanel.gamemateSVoice')}
        description={
          natural
            ? t('voicePanel.kokoroANaturalSoundingVoice')
            : t('voicePanel.usesTheVoicesBuiltInto')
        }
      >
        <Field label={t('voicePanel.voiceType')} help={t('voicePanel.naturalIsKokoroApache2')}>
          <select
            value={settings.voiceEngine}
            onChange={(e) => update({ voiceEngine: e.target.value as Settings['voiceEngine'] })}
            aria-label={t('voicePanel.voiceType')}
          >
            <option value="kokoro">{t('voicePanel.naturalKokoro')}</option>
            <option value="windows">{t('voicePanel.windowsVoices')}</option>
          </select>
        </Field>
        {natural && kokoro && (
          <Field
            label={
              <>
                {t('voicePanel.naturalVoice')}{' '}
                <span className="field-help">{t('voicePanel.mb', { size: kokoro.sizeMb })}</span>
              </>
            }
            help={
              kokoro.error ? (
                <span className="error-text">{kokoro.error}</span>
              ) : kokoro.installed ? (
                t('voicePanel.downloaded')
              ) : (
                t('voicePanel.downloadItOnceToUse')
              )
            }
          >
            <ModelButton model={kokoro} />
          </Field>
        )}
        <Field label={t('voicePanel.readAnswersAloud')}>
          <select
            value={settings.speakAnswers}
            onChange={(e) => update({ speakAnswers: e.target.value as SpeakAnswers })}
          >
            {SPEAK_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {t(`voicePanel.speakAnswers.${o}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('voicePanel.readCompanionCommentsAloud')}>
          <Toggle
            label={t('voicePanel.readCompanionCommentsAloud')}
            checked={settings.speakComments}
            onChange={(speakComments) => update({ speakComments })}
          />
        </Field>
        <Field label={t('voicePanel.voice')}>
          {natural ? (
            <select
              value={settings.kokoroVoice}
              onChange={(e) => update({ kokoroVoice: e.target.value })}
              aria-label={t('voicePanel.voice')}
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
              aria-label={t('voicePanel.voice')}
            >
              <option value="">{t('voicePanel.windowsDefault')}</option>
              {voices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('voicePanel.volume')}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceVolume}
            aria-label={t('voicePanel.volume')}
            onChange={(e) => update({ voiceVolume: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('voicePanel.speed')}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.voiceRate}
            aria-label={t('voicePanel.speed')}
            onChange={(e) => update({ voiceRate: Number(e.target.value) })}
          />
        </Field>
        <Field label={t('voicePanel.tryIt')}>
          <button type="button" onClick={() => speak(t('voicePanel.hiIMGamemateWatch'))}>
            {t('voicePanel.testVoice')}
          </button>
        </Field>
      </Section>
    </>
  )
}

export default VoicePanel
