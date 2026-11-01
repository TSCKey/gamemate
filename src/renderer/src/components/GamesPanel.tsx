import { useEffect, useState } from 'react'
import type {
  GameInfo,
  GamesState,
  ModpackSummary,
  RunningApp,
  Settings
} from '../../../preload/index.d'
import { errorMessage } from '../useSettings'
import { Field, Section, Toggle } from './ui'

const LAUNCHERS: Record<GameInfo['launcher'], string> = {
  builtin: 'Built in',
  steam: 'Steam',
  epic: 'Epic Games',
  battlenet: 'Battle.net',
  riot: 'Riot',
  manual: 'Added by you'
}

// What the player agrees to before GameMate looks at anything on their PC.
function DetectionConsent({ onAgree }: { onAgree: () => void }): React.JSX.Element {
  const [checked, setChecked] = useState(false)
  return (
    <div className="consent">
      <p>GameMate can find your games and follow the one you&apos;re playing. To do that it:</p>
      <ul className="privacy-list">
        <li>
          Reads the game lists of Steam, Epic Games, Battle.net and Riot on this PC, and your
          CurseForge Minecraft modpacks, when you click <strong>Scan for games</strong>.
        </li>
        <li>
          Looks up a wiki for each game it finds, sending only the game&apos;s name to wiki.gg and
          Fandom.
        </li>
        <li>Reads the name of the program in front while you play, to know which game it is.</li>
        <li>Keeps everything on this PC. Turning this off forgets all the games it found.</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Allow GameMate to look for games on this PC.
      </label>
      <div className="button-row">
        <button type="button" className="primary" disabled={!checked} onClick={onAgree}>
          Allow and scan for games
        </button>
      </div>
    </div>
  )
}

// A found or added game: launcher, wiki (which can be set or removed), and removal.
function GameRow({
  game,
  onChange
}: {
  game: GameInfo
  onChange: (state: GamesState) => void
}): React.JSX.Element {
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveWiki = async (value: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onChange(await window.api.games.setWiki(game.id, value))
      setAddress('')
      setEditing(false)
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
          {game.name} <span className="badge">{LAUNCHERS[game.launcher]}</span>
          {game.competitive && (
            <span
              className="badge is-warning"
              title="Ranked online game: AI help during matches may break its rules"
            >
              Competitive
            </span>
          )}
        </div>
        {editing || !game.wiki ? (
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
              placeholder={
                game.wiki
                  ? 'New wiki address'
                  : 'No wiki found. Paste its address, e.g. https://…fandom.com'
              }
              aria-label={`Wiki address for ${game.name}`}
              spellCheck={false}
            />
            <button type="submit" disabled={busy || !address.trim()}>
              {busy ? 'Checking…' : 'Use wiki'}
            </button>
          </form>
        ) : (
          <div className="field-help">
            Wiki: {game.wiki}{' '}
            <button type="button" className="link" onClick={() => setEditing(true)}>
              Change
            </button>
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
      <div className="model-actions">
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
  update
}: {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}): React.JSX.Element {
  const [games, setGames] = useState<GamesState | null>(null)
  const [packs, setPacks] = useState<ModpackSummary[] | null>(null)
  const [current, setCurrent] = useState<ModpackSummary | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const consent = settings.deviceConsent

  useEffect(() => {
    window.api.games.state().then(setGames)
  }, [settings.games])
  useEffect(() => {
    if (consent) window.api.modpacks.list().then(setPacks)
  }, [consent])
  useEffect(() => {
    window.api.modpacks.current().then(setCurrent)
  }, [settings.minecraftModpack, consent])

  const scan = async (): Promise<void> => {
    setScanning(true)
    setError(null)
    try {
      setGames(await window.api.games.scan())
      setPacks(await window.api.modpacks.list())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setScanning(false)
    }
  }

  const found = games?.games.filter((g) => g.launcher !== 'builtin') ?? []
  const choice = settings.minecraftModpack

  return (
    <>
      <Section
        title="Find your games"
        description="GameMate knows Minecraft out of the box. Your other games come from a scan of this PC."
      >
        {!consent ? (
          <DetectionConsent
            onAgree={async () => {
              update({ deviceConsent: true })
              await scan()
            }}
          />
        ) : (
          <>
            <Field
              label={scanning ? 'Scanning…' : `${found.length} games found`}
              help="Looks through Steam, Epic Games, Battle.net and Riot, and finds each game's wiki. Run it again after installing a game."
            >
              <button type="button" className="primary" onClick={scan} disabled={scanning}>
                {scanning ? 'Scanning…' : 'Scan for games'}
              </button>
            </Field>
            <Field
              label="Follow the game I'm playing"
              help="When you press the shortcut or the companion is watching, GameMate switches to the game in front."
            >
              <Toggle
                label="Follow the game I'm playing"
                checked={settings.autoDetectGame}
                onChange={(autoDetectGame) => update({ autoDetectGame })}
              />
            </Field>
            <Field
              label="Stop looking for games"
              help="Turns detection off and forgets every game GameMate found."
            >
              <button
                type="button"
                className="danger"
                onClick={() => update({ deviceConsent: false })}
              >
                Turn off
              </button>
            </Field>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </Section>

      {consent && (
        <Section
          title="Your games"
          description="Wikis were found by each game's name. If one is missing or wrong, paste the right address."
        >
          {found.map((g) => (
            <GameRow key={g.id} game={g} onChange={setGames} />
          ))}
          <div className="button-row">
            <AddGame onAdded={setGames} />
          </div>
          {found.some((g) => g.competitive) && (
            <p className="field-help">
              Competitive games: check the game&apos;s rules before using the companion during
              ranked matches.
            </p>
          )}
        </Section>
      )}

      {consent && (
        <Section
          title="Minecraft modpacks"
          description="Your CurseForge modpacks on this PC, so answers know which mods you have. With another launcher, GameMate reads the mods of the pack that's running."
        >
          <Field
            label="Modpack"
            help={
              current
                ? `Using ${current.name}${current.minecraftVersion ? `, Minecraft ${current.minecraftVersion}` : ''}${current.loader ? `, ${current.loader}` : ''}, ${current.modCount} mods.`
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
        </Section>
      )}
    </>
  )
}

export default GamesPanel
