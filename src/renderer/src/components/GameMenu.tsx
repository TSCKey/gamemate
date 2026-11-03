import type { GamesState, ModpackSummary, Settings } from '../../../preload/index.d'
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from './Menu'
import { t } from '../i18n'

// Top-bar chip with the game GameMate helps with; opens a menu to switch games.
function GameMenu({
  settings,
  update,
  games,
  modpack,
  onOpenSettings
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  games: GamesState | null
  modpack: ModpackSummary | null
  onOpenSettings: () => void
}): React.JSX.Element {
  const current = games?.games.find((g) => g.id === settings.currentGame)
  const label =
    settings.currentGame === 'minecraft'
      ? modpack
        ? `Minecraft · ${modpack.name}`
        : 'Minecraft'
      : (current?.name ?? t('gameMenu.game'))

  return (
    <Dropdown
      label={<span className="model-trigger-text">{label}</span>}
      menuLabel="Game"
      title={t('gameMenu.theGameGamemateHelpsWith')}
      triggerClassName="chip"
    >
      <>
        <MenuItem
          title={t('gameMenu.followTheGameIM')}
          description={
            settings.deviceConsent
              ? t('gameMenu.switchesByItselfWhenYou')
              : t('gameMenu.allowGameDetectionInSettings')
          }
          checked={settings.deviceConsent && settings.autoDetectGame}
          disabled={!settings.deviceConsent}
          onSelect={() => update({ autoDetectGame: !settings.autoDetectGame })}
        />
        <MenuSeparator />
        <MenuLabel>{t('gameMenu.game')}</MenuLabel>
        {(games?.games ?? []).map((g) => (
          <MenuItem
            key={g.id}
            title={g.name}
            checked={g.id === settings.currentGame}
            onSelect={() => update({ currentGame: g.id })}
          />
        ))}
        <MenuSeparator />
        <MenuItem
          title={settings.deviceConsent ? t('gameMenu.scanForGames') : t('gameMenu.findMyGames')}
          onSelect={onOpenSettings}
        />
      </>
    </Dropdown>
  )
}

export default GameMenu
