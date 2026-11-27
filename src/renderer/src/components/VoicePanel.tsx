import { useEffect, useState } from 'react'
import type {
  AppInfo,
  Settings,
  ListenModelId,
  SpeakAnswers,
  SpeechModelStatus,
  SupertonicVoice
} from '../../../preload/index.d'
import { SUPERTONIC_VOICES, VOICE_ENGINES } from '../../../shared/types'
import { VOICE_NAMES, kokoroHasOneVoice, voiceHint } from '../voice/voiceHint'
import { speak } from '../voice/speak'
import { Field, Section, Slider, Toggle } from './ui'
import { t } from '../i18n'
import { languageInfo } from '../../../shared/languages'
import { kokoroVoiceId, kokoroVoicesFor, type KokoroVoiceInfo } from '../../../shared/voices'
import { canListen } from '../../../shared/speech'
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

// 'British English · Male' in English, 'Male' in the other languages.
const describeKokoroVoice = (v: KokoroVoiceInfo): string =>
  [v.accent && t(`voicePanel.accents.${v.accent}`), t(`voicePanel.kokoroVoices.${v.gender}`)]
    .filter(Boolean)
    .join(' · ')

// Every Kokoro voice of the language, each with a sample to listen to before choosing it.
function KokoroVoiceList({
  voices,
  chosen,
  canListen,
  choose
}: {
  voices: KokoroVoiceInfo[]
  chosen: string | null
  canListen: boolean
  choose: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="voice-list" role="radiogroup" aria-label={t('voicePanel.voice')}>
      {voices.map((v) => (
        <div className="voice-row" key={v.id}>
          <label className="check">
            <input
              type="radio"
              name="kokoro-voice"
              value={v.id}
              checked={v.id === chosen}
              onChange={() => choose(v.id)}
            />
            <span>{v.name}</span>
            <span className="field-help">{describeKokoroVoice(v)}</span>
          </label>
          <button
            type="button"
            disabled={!canListen}
            aria-label={t('voicePanel.listenTo', { voice: v.name })}
            onClick={() =>
              window.api.voice.speak(t('voicePanel.hiIMGamemateWatch'), { kokoroVoice: v.id })
            }
          >
            {t('voicePanel.listen')}
          </button>
        </div>
      ))}
    </div>
  )
}

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

  useEffect(() => {
    window.api.voice.models().then(setModels)
    return window.api.voice.onModels(setModels)
  }, [])

  const listen = models.filter((m) => m.kind === 'listen')
  const selected = models.find((m) => m.id === settings.speechModel)
  const usesSupertonic = settings.voiceEngine === 'supertonic'
  const language = settings.language || 'en'
  const { sentenceName, voices } = languageInfo(language)
  // Why the chosen voice wouldn't read aloud (if it wouldn't).
  const isInstalled = (id: string): boolean => models.some((m) => m.id === id && m.installed)
  const hint = voiceHint({
    language,
    engine: settings.voiceEngine,
    installed: { kokoro: isInstalled('kokoro'), supertonic: isInstalled('supertonic') },
    kokoroVoice: settings.kokoroVoice,
    supertonicVoice: settings.naturalVoice
  })
  const other = hint.kind === 'cantSpeak' ? hint.other : null
  const oneKokoroVoice = kokoroHasOneVoice(language)
  // Kokoro's voices in the language (none where Kokoro doesn't speak it), and the one it reads with.
  const kokoroVoices = kokoroVoicesFor(language)
  const kokoroVoice = kokoroVoiceId(language, settings.kokoroVoice)

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
                        language: languageInfo(language).sentenceName
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
        description={t('voicePanel.naturalDescription')}
      >
        {VOICE_ENGINES.map((engine) => {
          const m = models.find((model) => model.id === engine)
          if (!m) return null
          const speaks = t(
            voices.includes(engine)
              ? 'voicePanel.speaksLanguage'
              : 'voicePanel.doesntSpeakLanguage',
            { language: sentenceName }
          )
          return (
            <Field
              key={engine}
              label={
                <label className="check">
                  <input
                    type="radio"
                    name="voice-engine"
                    checked={settings.voiceEngine === engine}
                    onChange={() => update({ voiceEngine: engine })}
                  />
                  {VOICE_NAMES[engine]}
                  <span className="field-help">{t('voicePanel.mb', { size: m.sizeMb })}</span>
                </label>
              }
              help={
                m.error ? (
                  <span className="error-text">{m.error}</span>
                ) : m.installed ? (
                  `${speaks} ${t('voicePanel.downloaded')}`
                ) : (
                  speaks
                )
              }
            >
              <ModelButton model={m} />
            </Field>
          )
        })}
        {other && (
          <div className="field">
            <p className="field-help">
              {t('voicePanel.cantSpeakLanguage', {
                voice: VOICE_NAMES[settings.voiceEngine],
                language: sentenceName,
                other: VOICE_NAMES[other]
              })}
            </p>
            <div className="field-control">
              <button type="button" onClick={() => update({ voiceEngine: other })}>
                {t('voicePanel.useVoice', { voice: VOICE_NAMES[other] })}
              </button>
            </div>
          </div>
        )}
        {hint.kind === 'notDownloaded' && (
          <p className="field-help">
            {t('voicePanel.downloadItOnceToUse', { voice: VOICE_NAMES[settings.voiceEngine] })}
          </p>
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
        {!usesSupertonic && kokoroVoices.length > 0 && (
          <div className="field field-stack">
            <div className="field-text">
              <div className="field-label">{t('voicePanel.voice')}</div>
              <div className="field-help">
                {oneKokoroVoice
                  ? t('voicePanel.kokoroOneVoice', { language: sentenceName })
                  : t('voicePanel.kokoroVoicesHelp')}
              </div>
            </div>
            <KokoroVoiceList
              voices={kokoroVoices}
              chosen={kokoroVoice}
              canListen={isInstalled('kokoro')}
              choose={(id) => update({ kokoroVoice: id })}
            />
          </div>
        )}
        {usesSupertonic && (
          <Field label={t('voicePanel.voice')}>
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
          </Field>
        )}
        <Field label={t('voicePanel.volume')}>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceVolume}
            label={t('voicePanel.volume')}
            onCommit={(voiceVolume) => update({ voiceVolume })}
          />
        </Field>
        <Field label={t('voicePanel.speed')}>
          <Slider
            min={0.5}
            max={2}
            step={0.1}
            value={settings.voiceRate}
            label={t('voicePanel.speed')}
            onCommit={(voiceRate) => update({ voiceRate })}
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
