import { useEffect, useState } from 'react'
import type { AppInfo, Settings, UpdateState } from '../../../preload/index.d'
import { DEFAULT_SHORTCUT, DEFAULT_VOICE_SHORTCUT } from '../../../shared/shortcuts'
import ShortcutField from './ShortcutField'
import { Field, Section, Toggle } from './ui'

function updateText(u: UpdateState): string {
  switch (u.status) {
    case 'dev':
      return 'Running from source code: updates come from git.'
    case 'checking':
      return 'Checking for updates…'
    case 'downloading':
      return `Downloading version ${u.available}… ${Math.round((u.progress ?? 0) * 100)}%`
    case 'ready':
      return `Version ${u.available} is ready. It installs when GameMate restarts.`
    case 'none':
      return 'GameMate is up to date.'
    case 'error':
      return u.error ?? 'Couldn’t check for updates.'
    default:
      return 'Updates come from GameMate’s releases on GitHub.'
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
    <Section title="Updates" description={`GameMate ${state.version}`}>
      <Field label="Status" help={updateText(state)}>
        {state.status === 'ready' ? (
          <button type="button" className="primary" onClick={() => window.api.updates.install()}>
            Restart and update
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || state.status === 'dev'}
            onClick={() => window.api.updates.check().then(setState)}
          >
            Check now
          </button>
        )}
      </Field>
      <Field
        label="Check for updates automatically"
        help="Looks for a new version when GameMate starts and every few hours, and downloads it in the background."
      >
        <Toggle
          label="Check for updates automatically"
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
      <Section title="In-game window">
        <Field
          label="Shortcut"
          help={
            appInfo?.shortcutRegistered === false
              ? 'Another app is using this shortcut, so it is off. Pick a different one, or close that app and restart GameMate.'
              : 'Opens a small window over your game to ask a question.'
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
          label="Voice shortcut"
          help={
            appInfo?.voiceShortcutRegistered === false
              ? 'Another app is using this shortcut, so it is off. Pick a different one.'
              : 'Opens the in-game window listening for a spoken question. Works while voice input is on (Settings → Voice).'
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

      <Section
        title="When you close the window"
        description="When GameMate quits, it frees the AI model right away so nothing keeps running in the background."
      >
        <Field
          label="Keep running in the tray"
          help={
            settings.closeToTray
              ? 'Keeps the in-game shortcuts and the companion working. Quit from the tray icon. The AI model is freed after a few idle minutes.'
              : 'Closing the window quits GameMate. The in-game shortcuts and the companion stop until you start it again.'
          }
        >
          <Toggle
            label="Keep running in the tray"
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
