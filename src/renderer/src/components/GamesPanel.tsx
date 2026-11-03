import { useEffect, useState } from 'react'
import type {
  GameInfo,
  GamesState,
  ModpackSummary,
  RunningApp,
  Settings,
  WikiChoice
} from '../../../preload/index.d'
import { errorMessage } from '../hooks/useSettings'
import { Field, Section, Toggle } from './ui'
import { Trans } from 'react-i18next'
import { t } from '../i18n'

const launcherName = (launcher: GameInfo['launcher']): string =>
  ({
    builtin: t('gamesPanel.builtIn'),
    steam: 'Steam',
    epic: 'Epic Games',
    battlenet: 'Battle.net',
    riot: 'Riot',
    manual: t('gamesPanel.addedByYou')
  })[launcher]

// What the player agrees to before GameMate looks at anything on their PC.
function DetectionConsent({ onAgree }: { onAgree: () => void }): React.JSX.Element {
  const [checked, setChecked] = useState(false)
  return (
    <div className="consent">
      <p>{t('gamesPanel.gamemateCanFindYourGames')}</p>
      <ul className="privacy-list">
        <li>
          <Trans i18nKey="gamesPanel.readsTheGameLists" components={{ b: <strong /> }} />
        </li>
        <li>{t('gamesPanel.looksUpAWikiFor')}</li>
        <li>{t('gamesPanel.readsTheNameOfThe')}</li>
        <li>{t('gamesPanel.keepsEverythingOnThisPc')}</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        {t('gamesPanel.allowGamemateToLook')}
      </label>
      <div className="button-row">
        <button type="button" className="primary" disabled={!checked} onClick={onAgree}>
          {t('gamesPanel.allowAndScanForGames')}
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
  // The wikis found for this game, once the player asks for them.
  const [choices, setChoices] = useState<WikiChoice[] | null>(null)

  const showChoices = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setChoices(await window.api.games.wikiChoices(game.id))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const saveWiki = async (value: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onChange(await window.api.games.setWiki(game.id, value))
      setAddress('')
      setEditing(false)
      setChoices(null)
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
          {game.name} <span className="badge">{launcherName(game.launcher)}</span>
          {game.competitive && (
            <span className="badge is-warning" title={t('gamesPanel.rankedOnlineGameAiHelp')}>
              {t('gamesPanel.competitive')}
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
                game.wiki ? t('gamesPanel.newWikiAddress') : t('gamesPanel.noWikiFoundPasteIts')
              }
              aria-label={t('gamesPanel.wikiAddressFor', { name: game.name })}
              spellCheck={false}
            />
            <button type="submit" disabled={busy || !address.trim()}>
              {busy ? t('gamesPanel.checking') : t('gamesPanel.useWiki')}
            </button>
          </form>
        ) : (
          <div className="field-help">
            {t('gamesPanel.wiki', { wiki: game.wiki })}{' '}
            <button type="button" className="link" onClick={() => setEditing(true)}>
              {t('gamesPanel.change')}
            </button>
            {' · '}
            <button type="button" className="link" disabled={busy} onClick={showChoices}>
              {busy && !choices ? t('gamesPanel.looking') : t('gamesPanel.otherWikis')}
            </button>
          </div>
        )}
        {choices && (
          <ul className="wiki-choices">
            {choices.length === 0 && (
              <li>{t('gamesPanel.noOtherWikisFound', { name: game.name })}</li>
            )}
            {choices.map((c) => (
              <li key={c.address}>
                <span>
                  <strong>{c.name}</strong> ({new URL(c.address).host}):{' '}
                  {t('gamesPanel.wikiSize', { pages: c.articles, editors: c.activeUsers })}
                </span>
                {c.current ? (
                  <span className="badge">{t('gamesPanel.inUse')}</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => saveWiki(c.address)}>
                    {t('gamesPanel.use')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
      <div className="model-actions">
        <button
          type="button"
          onClick={async () => onChange(await window.api.games.remove(game.id))}
        >
          {t('gamesPanel.remove')}
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
        {t('gamesPanel.addAGameThatS')}
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
        <p className="field-help">{t('gamesPanel.noProgramsWithAWindow')}</p>
      ) : (
        <>
          <select
            value={exe}
            aria-label={t('gamesPanel.runningProgram')}
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
            placeholder={t('gamesPanel.gameName')}
            aria-label={t('gamesPanel.gameName')}
          />
          <button type="submit" className="primary" disabled={!exe || !name.trim()}>
            {t('gamesPanel.add')}
          </button>
        </>
      )}
      <button type="button" onClick={() => setApps(null)}>
        {t('gamesPanel.cancel')}
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
        title={t('gamesPanel.findYourGames')}
        description={t('gamesPanel.gamemateKnowsMinecraftOutOf')}
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
              label={
                scanning
                  ? t('gamesPanel.scanning')
                  : t('gamesPanel.gamesFound', { count: found.length })
              }
              help={t('gamesPanel.looksThroughSteamEpicGames')}
            >
              <button type="button" className="primary" onClick={scan} disabled={scanning}>
                {scanning ? t('gamesPanel.scanning') : t('gamesPanel.scanForGames')}
              </button>
            </Field>
            <Field
              label={t('gamesPanel.followTheGameIM')}
              help={t('gamesPanel.whenYouPressTheShortcut')}
            >
              <Toggle
                label={t('gamesPanel.followTheGameIM')}
                checked={settings.autoDetectGame}
                onChange={(autoDetectGame) => update({ autoDetectGame })}
              />
            </Field>
            <Field
              label={t('gamesPanel.stopLookingForGames')}
              help={t('gamesPanel.turnsDetectionOffAndForgets')}
            >
              <button
                type="button"
                className="danger"
                onClick={() => update({ deviceConsent: false })}
              >
                {t('gamesPanel.turnOff')}
              </button>
            </Field>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </Section>

      {consent && (
        <Section title={t('gamesPanel.yourGames')} description={t('gamesPanel.eachGameSWikiWas')}>
          {found.map((g) => (
            <GameRow key={g.id} game={g} onChange={setGames} />
          ))}
          <div className="button-row">
            <AddGame onAdded={setGames} />
          </div>
          {found.some((g) => g.competitive) && (
            <p className="field-help">{t('gamesPanel.competitiveGamesCheckTheGame')}</p>
          )}
        </Section>
      )}

      {consent && (
        <Section
          title={t('gamesPanel.minecraftModpacks')}
          description={t('gamesPanel.yourCurseforgeModpacksOnThis')}
        >
          <Field
            label={t('gamesPanel.modpack')}
            help={
              current
                ? t('gamesPanel.usingModpack', {
                    pack: [
                      current.name,
                      current.minecraftVersion && `Minecraft ${current.minecraftVersion}`,
                      current.loader
                    ]
                      .filter(Boolean)
                      .join(', '),
                    count: current.modCount
                  })
                : choice === 'auto'
                  ? t('gamesPanel.noModpackRunningRightNow')
                  : t('gamesPanel.plainMinecraftWithoutMods')
            }
          >
            <select
              value={choice}
              onChange={(e) => update({ minecraftModpack: e.target.value })}
              aria-label={t('gamesPanel.modpack')}
            >
              <option value="auto">{t('gamesPanel.detectTheOneIM')}</option>
              <option value="">{t('gamesPanel.nonePlainMinecraft')}</option>
              {(packs ?? []).map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name} · {p.minecraftVersion} · {t('gamesPanel.mods', { count: p.modCount })}
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
