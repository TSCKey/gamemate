import type { CompanionState, Settings } from '../../../preload/index.d'
import { COMMENTARY_FREQUENCIES, COMPANION_MODES, STATUS_TEXT } from '../constants'
import { Dropdown, MenuItem, MenuLabel, MenuNote, MenuSeparator } from './Menu'

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
      menuLabel="Companion mode"
      title={`Companion: ${mode.label}${watching ? ` · ${STATUS_TEXT[status]}` : ''}`}
      triggerClassName="chip"
      label={
        <span className={`companion-status is-${status}`}>
          <span className="companion-dot" /> {mode.label}
        </span>
      }
    >
      <>
        <MenuLabel>Companion mode</MenuLabel>
        {watching && (
          <MenuNote>
            <span className={`companion-status is-${status}`}>
              <span className="companion-dot" /> {STATUS_TEXT[status]}
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
            <MenuLabel>How often to comment</MenuLabel>
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
            title={state.paused ? '▶ Resume watching' : '⏸ Pause watching'}
            onSelect={() => window.api.companion.setPaused(!state.paused)}
          />
        )}
        <MenuItem title="Companion settings…" onSelect={onOpenSettings} />
      </>
    </Dropdown>
  )
}

export default CompanionMenu
