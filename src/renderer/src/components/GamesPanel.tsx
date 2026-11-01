import { useEffect, useState } from 'react'
import type { GamesState, ModpackSummary, RunningApp, Settings } from '../../../preload/index.d'
import { errorMessage } from '../useSettings'
import { Field, Section, Toggle } from './ui'

// A player-added game: its wiki can be set or removed.
function CustomGameRow({
  game,
  wiki,
  onChange
}: {
  game: { id: string; name: string; exe: string | null }
  wiki: string | null
  onChange: (state: GamesState) => void
}): React.JSX.Element {
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveWiki = async (value: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onChange(await window.api.games.setWiki(game.id, value))
      setAddress('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="model-row">
      <div className="model-info">
        <div className="field-label">
          {game.name} <span className="badge">{game.exe}</span>
        </div>
        {wiki ? (
          <div className="field-help">Wiki: {wiki}</div>
        ) : (
          <form
            className="key-form game-wiki-form"
            onSubmit={(e) => {
              e.preventDefault()
              saveWiki(address)
            }}
          >
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Wiki address (optional), e.g. https://hades.fandom.com"
              aria-label={`Wiki address for ${game.name}`}
              spellCheck={false}
            />
            <button type="submit" disabled={busy || !address.trim()}>
              {busy ? 'Checking…' : 'Add wiki'}
            </button>
          </form>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
      <div className="model-actions">
        {wiki && (
          <button type="button" onClick={() => saveWiki('')} disabled={busy}>
            Remove wiki
          </button>
        )}
        <button
          type="button"
          onClick={async () => onChange(await window.api.games.remove(game.id))}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

// Pick a program that's running and add it as a game.
function AddGame({ onAdded }: { onAdded: (state: GamesState) => void }): React.JSX.Element {
  const [apps, setApps] = useState<RunningApp[] | null>(null)
  const [exe, setExe] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    setError(null)
    const list = await window.api.games.runningApps()
    setApps(list)
    setExe(list[0]?.exe ?? '')
    setName(list[0]?.title ?? '')
  }

  if (!apps) {
    return (
      <button type="button" onClick={load}>
        Add a game that&apos;s running…
      </button>
    )
  }
  return (
    <form
      className="add-game"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          onAdded(await window.api.games.add(exe, name))
          setApps(null)
        } catch (err) {
          setError(errorMessage(err))
        }
      }}
    >
      {apps.length === 0 ? (
        <p className="field-help">
          No programs with a window found. Start your game, then try again.
        </p>
      ) : (
        <>
          <select
            value={exe}
            aria-label="Running program"
            onChange={(e) => {
              setExe(e.target.value)
              setName(apps.find((a) => a.exe === e.target.value)?.title ?? '')
            }}
          >
            {apps.map((a) => (
              <option key={a.exe} value={a.exe}>
                {a.title} ({a.exe})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Game name"
            aria-label="Game name"
          />
          <button type="submit" className="primary" disabled={!exe || !name.trim()}>
            Add
          </button>
        </>
      )}
      <button type="button" onClick={() => setApps(null)}>
        Cancel
      </button>
      {error && <p className="error-text">{error}</p>}
    </form>
  )
}

function GamesPanel({
  settings,
  update,
  versions
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  versions: string[]
}): React.JSX.Element {
  const [games, setGames] = useState<GamesState | null>(null)
  const [packs, setPacks] = useState<ModpackSummary[] | null>(null)
  const [current, setCurrent] = useState<ModpackSummary | null>(null)

  useEffect(() => {
    window.api.games.state().then(setGames)
    window.api.modpacks.list().then(setPacks)
  }, [])
  useEffect(() => {
    window.api.modpacks.current().then(setCurrent)
  }, [settings.minecraftModpack])

  const custom = games?.games.filter((g) => g.custom) ?? []
  const builtIn = games?.games.filter((g) => !g.custom) ?? []
  const choice = settings.minecraftModpack

  return (
    <>
      <Section title="Which game">
        <Field
          label="Follow the game I'm playing"
          help="When you press the shortcut or the companion is watching, GameMate switches to the game in front. It only reads the name of the program in front."
        >
          <Toggle
            label="Follow the game I'm playing"
            checked={settings.autoDetectGame}
            onChange={(autoDetectGame) => update({ autoDetectGame })}
          />
        </Field>
        <Field label="Current game">
          <select
            value={settings.currentGame}
            onChange={(e) => update({ currentGame: e.target.value })}
            aria-label="Current game"
          >
            {(games?.games ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title="Minecraft modpacks"
        description="GameMate reads your CurseForge modpacks on this PC, so answers know which mods you have. With another launcher, it reads the mods of the pack that's running."
      >
        <Field
          label="Modpack"
          help={
            current
              ? `Using ${current.name}${current.minecraftVersion ? ` (Minecraft ${current.minecraftVersion}` : ''}${current.loader ? `, ${current.loader}` : ''}${current.minecraftVersion ? ')' : ''}, ${current.modCount} mods.`
              : choice === 'auto'
                ? 'No modpack running right now. Start one, or pick it here.'
                : 'Plain Minecraft, without mods.'
          }
        >
          <select
            value={choice}
            onChange={(e) => update({ minecraftModpack: e.target.value })}
            aria-label="Modpack"
          >
            <option value="auto">Detect the one I&apos;m playing</option>
            <option value="">None (plain Minecraft)</option>
            {(packs ?? []).map((p) => (
              <option key={p.path} value={p.path}>
                {p.name} · {p.minecraftVersion} · {p.modCount} mods
              </option>
            ))}
            {choice && choice !== 'auto' && !packs?.some((p) => p.path === choice) && (
              <option value={choice}>{current?.name ?? choice}</option>
            )}
          </select>
        </Field>
        {!current && (
          <Field label="Minecraft version" help="Recipes are shown for this version.">
            <select
              value={settings.minecraftVersion}
              onChange={(e) => update({ minecraftVersion: e.target.value })}
              aria-label="Minecraft version"
            >
              {versions.map((v) => (
                <option key={v} value={v}>
                  Minecraft {v}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      <Section
        title="Your games"
        description="Add any game GameMate doesn't know yet. Start it first, then pick it from the list. Adding its wiki lets GameMate look things up for it."
      >
        {custom.map((g) => (
          <CustomGameRow key={g.id} game={g} wiki={g.wiki} onChange={(state) => setGames(state)} />
        ))}
        <div className="button-row">
          <AddGame onAdded={(state) => setGames(state)} />
        </div>
      </Section>

      <Section
        title="Games GameMate knows"
        description="Recognized automatically, with their wikis for looking things up."
      >
        <ul className="game-list">
          {builtIn.map((g) => (
            <li key={g.id}>
              <span className="field-label">{g.name}</span>
              {g.wiki && <span className="field-help">{g.wiki}</span>}
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

export default GamesPanel
