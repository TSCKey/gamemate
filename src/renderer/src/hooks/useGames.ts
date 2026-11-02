import { useEffect, useState } from 'react'
import type { GamesState, ModpackSummary, Settings } from '../../../preload/index.d'
import { TERMS_VERSION } from '../constants'

// The games GameMate knows (built in and added by the player) and which one is current.
export function useGames(settings: Settings | null): GamesState | null {
  const [state, setState] = useState<GamesState | null>(null)
  // Ask again whenever the current game or the player's games change.
  const key = settings
    ? `${settings.currentGame}|${settings.games.map((g) => `${g.id}:${g.wiki?.api ?? ''}`).join(',')}`
    : ''
  useEffect(() => {
    if (key) window.api.games.state().then(setState)
  }, [key])
  return state
}

// The Minecraft modpack in use, refreshed when the choice changes or GameMate gets focus.
export function useModpack(settings: Settings | null): ModpackSummary | null {
  const [pack, setPack] = useState<ModpackSummary | null>(null)
  // Reading modpack folders waits until the Terms of Use are accepted.
  const relevant = settings?.currentGame === 'minecraft' && settings.termsVersion >= TERMS_VERSION
  const choice = settings?.minecraftModpack
  useEffect(() => {
    if (!relevant) return
    const load = (): void => {
      window.api.modpacks
        .current()
        .then(setPack)
        .catch(() => setPack(null))
    }
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [relevant, choice])
  return relevant ? pack : null
}
