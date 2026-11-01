import type { GamesState, ModpackSummary, Settings } from '../../../preload/index.d'
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from './Menu'

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
      : (current?.name ?? 'Game')

  return (
    <Dropdown
      label={<span className="model-trigger-text">{label}</span>}
      menuLabel="Game"
      title="The game GameMate helps with"
      triggerClassName="chip"
    >
      <>
        <MenuItem
          title="Follow the game I'm playing"
          description={
            settings.deviceConsent
              ? 'Switches by itself when you’re in a game'
              : 'Allow game detection in Settings → Games first'
          }
          checked={settings.deviceConsent && settings.autoDetectGame}
          disabled={!settings.deviceConsent}
          onSelect={() => update({ autoDetectGame: !settings.autoDetectGame })}
        />
        <MenuSeparator />
        <MenuLabel>Game</MenuLabel>
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
          title={settings.deviceConsent ? 'Scan for games…' : 'Find my games…'}
          onSelect={onOpenSettings}
        />
      </>
    </Dropdown>
  )
}

export default GameMenu
