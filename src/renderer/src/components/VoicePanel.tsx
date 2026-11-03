import { useEffect, useState } from 'react'
import type {
  AppInfo,
  Settings,
  ListenModelId,
  SpeakAnswers,
  SpeechModelStatus,
  SupertonicVoice,
  WindowsVoice
} from '../../../preload/index.d'
import { SUPERTONIC_VOICES } from '../../../shared/types'
import { speak } from '../voice/speak'
import { Field, Section, Toggle } from './ui'
import { t } from '../i18n'
import { languageInfo } from '../../../shared/languages'
import { canListen } from '../../../shared/speech'
import { windowsVoicesFor } from '../../../shared/voices'
import { naturalVoiceLabel } from '../voice/labels'

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
  const [voices, setVoices] = useState<WindowsVoice[]>([])

  useEffect(() => {
    window.api.voice.models().then(setModels)
    return window.api.voice.onModels(setModels)
  }, [])

  // Asked again when the player comes back from adding a voice in Windows' Settings.
  useEffect(() => {
    const refresh = (): void => void window.api.voice.voices().then(setVoices)
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const listen = models.filter((m) => m.kind === 'listen')
  const supertonic = models.find((m) => m.id === 'supertonic')
  const selected = models.find((m) => m.id === settings.speechModel)
  const natural = settings.voiceEngine === 'natural'
  const language = settings.language || 'en'
  const { nativeName, naturalVoice: naturalSpeaksIt } = languageInfo(language)
  const windowsVoices = windowsVoicesFor(language, voices)
  // Supertonic speaks unless the language is one it doesn't (Chinese); then a Windows voice does.
  const speaksNaturally = natural && naturalSpeaksIt

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
                  ) : m.englishOnly ? (
                    language === 'en' ? (
                      t('voicePanel.englishOnlyWorks')
                    ) : (
                      t('voicePanel.englishOnlyModel', {
                        language: languageInfo(language).nativeName
                      })
                    )
                  ) : (
                    t(`voicePanel.speechModels.${m.id}.help`)
                  )
                }
              >
                <ModelButton model={m} />
              </Field>
            ))}
            {!canListen(selected, language) && (
              <p className="field-help">{t('voicePanel.downloadTheSelectedModelOnce')}</p>
            )}
          </>
        )}
      </Section>

      <Section
        title={t('voicePanel.gamemateSVoice')}
        description={
          natural ? t('voicePanel.naturalDescription') : t('voicePanel.usesTheVoicesBuiltInto')
        }
      >
        <Field label={t('voicePanel.voiceType')} help={t('voicePanel.naturalHelp')}>
          <select
            value={settings.voiceEngine}
            onChange={(e) => update({ voiceEngine: e.target.value as Settings['voiceEngine'] })}
            aria-label={t('voicePanel.voiceType')}
          >
            <option value="natural">{t('voicePanel.naturalSupertonic')}</option>
            <option value="windows">{t('voicePanel.windowsVoices')}</option>
          </select>
        </Field>
        {natural && supertonic && (
          <Field
            label={
              <>
                {t('voicePanel.naturalVoice')}{' '}
                <span className="field-help">
                  {t('voicePanel.mb', { size: supertonic.sizeMb })}
                </span>
              </>
            }
            help={
              supertonic.error ? (
                <span className="error-text">{supertonic.error}</span>
              ) : !naturalSpeaksIt ? (
                t('voicePanel.naturalNotForLanguage', { language: nativeName })
              ) : supertonic.installed ? (
                t('voicePanel.downloaded')
              ) : (
                t('voicePanel.downloadItOnceToUse')
              )
            }
          >
            <ModelButton model={supertonic} />
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
        <Field
          label={t('voicePanel.voice')}
          help={
            !speaksNaturally &&
            (windowsVoices.length
              ? t('voicePanel.addWindowsVoicesHelp')
              : t('voicePanel.noWindowsVoice', { language: nativeName }))
          }
        >
          {speaksNaturally ? (
            <select
              value={settings.naturalVoice}
              onChange={(e) => update({ naturalVoice: e.target.value as SupertonicVoice })}
              aria-label={t('voicePanel.voice')}
            >
              {SUPERTONIC_VOICES.map((v) => (
                <option key={v} value={v}>
                  {naturalVoiceLabel(v)}
                </option>
              ))}
            </select>
          ) : (
            <div className="button-row">
              {windowsVoices.length > 0 && (
                <select
                  value={settings.voiceName}
                  onChange={(e) => update({ voiceName: e.target.value })}
                  aria-label={t('voicePanel.voice')}
                >
                  <option value="">{t('voicePanel.windowsDefault')}</option>
                  {windowsVoices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={() => window.api.voice.openWindowsVoices()}>
                {t('voicePanel.addWindowsVoices')}
              </button>
            </div>
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
