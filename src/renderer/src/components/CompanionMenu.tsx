import type { CompanionState, Settings } from '../../../preload/index.d'
import { COMMENTARY_FREQUENCIES, COMPANION_MODES, statusText } from '../constants'
import { Dropdown, MenuItem, MenuLabel, MenuNote, MenuSeparator } from './Menu'
import { t } from '../i18n'

// Top-bar chip showing the companion mode and whether it's watching; opens a menu to change it.
function CompanionMenu({
  settings,
  update,
  state,
  onOpenSettings
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  state: CompanionState | null
  onOpenSettings: () => void
}): React.JSX.Element {
  const mode = COMPANION_MODES.find((m) => m.value === settings.companionMode) ?? COMPANION_MODES[1]
  const status = state?.status ?? 'off'
  const watching = status !== 'off'

  return (
    <Dropdown
      menuLabel={t('companionMenu.companionMode')}
      title={`${t('companionMenu.companion', { mode: mode.label })}${watching ? ` · ${statusText(status)}` : ''}`}
      triggerClassName="chip"
      label={
        <span className={`companion-status is-${status}`}>
          <span className="companion-dot" /> {mode.label}
        </span>
      }
    >
      <>
        <MenuLabel>{t('companionMenu.companionMode')}</MenuLabel>
        {watching && (
          <MenuNote>
            <span className={`companion-status is-${status}`}>
              <span className="companion-dot" /> {statusText(status)}
              {state?.game && status !== 'waiting-for-game' ? ` · ${state.game}` : ''}
            </span>
          </MenuNote>
        )}
        {COMPANION_MODES.map((m) => (
          <MenuItem
            key={m.value}
            title={m.label}
            description={m.help}
            checked={settings.companionMode === m.value}
            onSelect={() => update({ companionMode: m.value })}
          />
        ))}
        {settings.companionMode === 'commentary' && (
          <>
            <MenuSeparator />
            <MenuLabel>{t('companionMenu.howOftenToComment')}</MenuLabel>
            {COMMENTARY_FREQUENCIES.map((f) => (
              <MenuItem
                key={f.value}
                title={f.label}
                checked={settings.commentaryFrequency === f.value}
                onSelect={() => update({ commentaryFrequency: f.value })}
              />
            ))}
          </>
        )}
        <MenuSeparator />
        {watching && state && (
          <MenuItem
            title={
              state.paused ? t('companionMenu.resumeWatching') : t('companionMenu.pauseWatching')
            }
            onSelect={() => window.api.companion.setPaused(!state.paused)}
          />
        )}
        <MenuItem title={t('companionMenu.companionSettings')} onSelect={onOpenSettings} />
      </>
    </Dropdown>
  )
}

export default CompanionMenu
