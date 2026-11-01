import type { AppInfo, Settings } from '../../../preload/index.d'
import { Field, Section, Toggle } from './ui'

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
    </>
  )
}

export default GeneralPanel
