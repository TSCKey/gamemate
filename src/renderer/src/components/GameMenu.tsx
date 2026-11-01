import type { GamesState, ModpackSummary, Settings } from '../../../preload/index.d'
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from './Menu'

// Top-bar chip with the game GameMate helps with; opens a menu to switch games.
function GameMenu({
  settings,
  update,
  games,
  versions,
  modpack,
  onOpenSettings
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  games: GamesState | null
  versions: string[]
  modpack: ModpackSummary | null
  onOpenSettings: () => void
}): React.JSX.Element {
  const current = games?.games.find((g) => g.id === settings.currentGame)
  const minecraft = settings.currentGame === 'minecraft'
  const label = minecraft
    ? modpack
      ? `Minecraft · ${modpack.name}`
      : `Minecraft ${settings.minecraftVersion}`
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
          description="Switches by itself when you're in a game"
          checked={settings.autoDetectGame}
          onSelect={() => update({ autoDetectGame: !settings.autoDetectGame })}
        />
        <MenuSeparator />
        <MenuLabel>Game</MenuLabel>
        {(games?.games ?? []).map((g) => (
          <MenuItem
            key={g.id}
            title={g.name}
            description={g.custom ? 'Added by you' : undefined}
            checked={g.id === settings.currentGame}
            onSelect={() => update({ currentGame: g.id })}
          />
        ))}
        {minecraft && !modpack && versions.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Minecraft version</MenuLabel>
            {versions.map((v) => (
              <MenuItem
                key={v}
                title={`Minecraft ${v}`}
                checked={settings.minecraftVersion === v}
                onSelect={() => update({ minecraftVersion: v })}
              />
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuItem title="Games and modpacks…" onSelect={onOpenSettings} />
      </>
    </Dropdown>
  )
}

export default GameMenu
