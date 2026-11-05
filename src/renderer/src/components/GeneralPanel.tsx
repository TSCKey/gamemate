import { useEffect, useState } from 'react'
import type { AppInfo, Settings, UpdateState } from '../../../preload/index.d'
import { DEFAULT_SHORTCUT, DEFAULT_VOICE_SHORTCUT } from '../../../shared/shortcuts'
import { LANGUAGES, type LanguageCode } from '../../../shared/languages'
import ShortcutField from './ShortcutField'
import { Field, Section, Toggle } from './ui'
import { t } from '../i18n'

function updateText(u: UpdateState): string {
  switch (u.status) {
    case 'dev':
      return t('generalPanel.runningFromSourceCodeUpdates')
    case 'checking':
      return t('generalPanel.checkingForUpdates')
    case 'downloading':
      return t('generalPanel.downloadingVersion', {
        available: u.available,
        value: Math.round((u.progress ?? 0) * 100)
      })
    case 'ready':
      return t('generalPanel.versionIsReadyItInstalls', { available: u.available })
    case 'none':
      return t('generalPanel.gamemateIsUpToDate')
    case 'error':
      return u.error ?? t('generalPanel.couldnTCheckForUpdates')
    default:
      return t('generalPanel.updatesComeFromGamemateS')
  }
}

// Version, update status and the buttons to check or install.
function Updates({
  settings,
  update
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    window.api.updates.state().then(setState)
    return window.api.updates.onState(setState)
  }, [])
  if (!state) return <></>
  const busy = state.status === 'checking' || state.status === 'downloading'
  return (
    <Section title={t('generalPanel.updates')} description={`GameMate ${state.version}`}>
      <Field label={t('generalPanel.status')} help={updateText(state)}>
        {state.status === 'ready' ? (
          <button type="button" className="primary" onClick={() => window.api.updates.install()}>
            {t('generalPanel.restartAndUpdate')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || state.status === 'dev'}
            onClick={() => window.api.updates.check().then(setState)}
          >
            {t('generalPanel.checkNow')}
          </button>
        )}
      </Field>
      <Field
        label={t('generalPanel.checkForUpdatesAutomatically')}
        help={t('generalPanel.looksForANewVersion')}
      >
        <Toggle
          label={t('generalPanel.checkForUpdatesAutomatically')}
          checked={settings.autoUpdate}
          onChange={(autoUpdate) => update({ autoUpdate })}
        />
      </Field>
    </Section>
  )
}

function GeneralPanel({
  settings,
  update,
  appInfo
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  appInfo: AppInfo | null
}): React.JSX.Element {
  return (
    <>
      <Section title={t('generalPanel.language')}>
        <Field label={t('generalPanel.language')} help={t('generalPanel.languageHelp')}>
          <select
            value={settings.language || 'en'}
            aria-label={t('generalPanel.language')}
            onChange={(e) => update({ language: e.target.value as LanguageCode })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.nativeName}
              </option>
            ))}
          </select>
        </Field>
      </Section>
      <Section title={t('generalPanel.inGameWindow')}>
        <Field
          label={t('generalPanel.shortcut')}
          help={
            appInfo?.shortcutRegistered === false
              ? t('generalPanel.anotherAppIsUsingThis')
              : t('generalPanel.opensASmallWindowOver')
          }
        >
          <ShortcutField
            value={settings.shortcut}
            fallback={DEFAULT_SHORTCUT}
            other={settings.voiceShortcut}
            onChange={(shortcut) => update({ shortcut })}
          />
        </Field>
        <Field
          label={t('generalPanel.voiceShortcut')}
          help={
            appInfo?.voiceShortcutRegistered === false
              ? t('generalPanel.anotherAppIsUsingThis2')
              : t('generalPanel.opensTheInGameWindow')
          }
        >
          <ShortcutField
            value={settings.voiceShortcut}
            fallback={DEFAULT_VOICE_SHORTCUT}
            other={settings.shortcut}
            onChange={(voiceShortcut) => update({ voiceShortcut })}
          />
        </Field>
        <Field
          label={t('generalPanel.sendAScreenshotWithQuestions')}
          help={t('generalPanel.letsGamemateSeeWhatYou')}
        >
          <Toggle
            label={t('generalPanel.sendAScreenshotWithQuestions')}
            checked={settings.overlayScreenshot}
            onChange={(overlayScreenshot) => update({ overlayScreenshot })}
          />
        </Field>
        <Field label={t('generalPanel.chatScreenshot')} help={t('generalPanel.chatScreenshotHelp')}>
          <Toggle
            label={t('generalPanel.chatScreenshot')}
            checked={settings.chatScreenshot}
            onChange={(chatScreenshot) => update({ chatScreenshot })}
          />
        </Field>
      </Section>

      <Section
        title={t('generalPanel.whenYouCloseTheWindow')}
        description={t('generalPanel.whenGamemateQuitsItFrees')}
      >
        <Field
          label={t('generalPanel.keepRunningInTheTray')}
          help={
            settings.closeToTray
              ? t('generalPanel.keepsTheInGameShortcuts')
              : t('generalPanel.closingTheWindowQuitsGamemate')
          }
        >
          <Toggle
            label={t('generalPanel.keepRunningInTheTray')}
            checked={settings.closeToTray}
            onChange={(closeToTray) => update({ closeToTray })}
          />
        </Field>
      </Section>

      <Updates settings={settings} update={update} />
    </>
  )
}

export default GeneralPanel
