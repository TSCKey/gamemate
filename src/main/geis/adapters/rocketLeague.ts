// Rocket League from its own Stats API, once the player has turned it on in the game's settings
// file. While it isn't on (or the game isn't listening yet), Rocket League is watched like any game
// with a known HUD layout (killfeed.ts). Every few seconds this checks the game's setting and, when
// it's on, connects; it answers for the game once connected.
import type { GameProfile } from '../../games/catalog'
import { readStatsConfig, StatsFeed, type StatsApiConfig } from '../../games/rocketStats'
import { parsePlayerNames } from '../../companion/areaReading'
import { RocketWatch, type RocketMessage } from '../../companion/rocketReading'
import type { FrameReport, GameEvent } from '../../companion/events'
import type { AdapterHost, GameAdapter } from '../adapter'
import { pipelineTap } from '../tap'

const TICK_MS = 1_000
const CONFIG_MS = 30_000
// Sent many times a second, or for every touch: not told in the inspector one by one.
const QUIET = new Set(['UpdateState', 'BallHit', 'ClockUpdatedSeconds', 'BoostPickup'])

export const isRocketLeague = (game: GameProfile): boolean => /^rocket league$/i.test(game.name)

export function createRocketLeague(host: AdapterHost): GameAdapter {
  const feed = new StatsFeed()
  const watch = new RocketWatch()
  let config: { dir: string; at: number; value: StatsApiConfig | null } | null = null

  feed.onStatus = (status, port) => {
    if (!pipelineTap.enabled) return
    pipelineTap.record({
      at: Date.now(),
      stage: 'observation',
      adapterId: 'rocket-league',
      summary: `rocket: Stats API ${status} (ws://127.0.0.1:${port})`
    })
  }

  function settingFor(game: GameProfile, now: number): StatsApiConfig | null {
    const dir = game.installDir ?? ''
    if (!dir) return null
    if (!config || config.dir !== dir || now - config.at > CONFIG_MS) {
      config = { dir, at: now, value: readStatsConfig(dir) }
    }
    return config.value
  }

  function tell(message: RocketMessage): void {
    if (!pipelineTap.enabled || QUIET.has(message.Event)) return
    const data = JSON.stringify(message.Data ?? {}).slice(0, 150)
    pipelineTap.record({
      at: Date.now(),
      stage: 'observation',
      adapterId: 'rocket-league',
      summary: `rocket: ${message.Event} ${data}`
    })
  }

  return {
    id: 'rocket-league',
    matches: (game) => {
      if (!isRocketLeague(game)) return 0
      const setting = settingFor(game, Date.now())
      if (setting?.enabled) feed.ensure(setting.webPort)
      return feed.connected ? 4 : 0
    },
    tickMs: TICK_MS,
    watch: async (settings, game) => {
      host.setState({ status: 'watching', game: game.name })
      const names = parsePlayerNames(settings.commentaryPlayerNames)
      const events: GameEvent[] = []
      for (const message of feed.drain()) {
        tell(message)
        events.push(...watch.absorb(message, Date.now(), names))
      }
      if (events.length > 0) {
        const ended = events.some((e) => e.type === 'victory' || e.type === 'defeat')
        const report: FrameReport = {
          time: Date.now(),
          source: 'game',
          adapterId: 'rocket-league',
          phase: ended ? 'intermission' : 'playing',
          inFight: false,
          score: null,
          description: '',
          events
        }
        host.observe(report, game, '')
      }
      if (pipelineTap.enabled && watch.unknownStats.size > 0) {
        pipelineTap.record({
          at: Date.now(),
          stage: 'observation',
          adapterId: 'rocket-league',
          summary: `rocket: stat events not read yet: ${[...watch.unknownStats].join(', ')}`
        })
        watch.unknownStats.clear()
      }
      await host.speakIfDue(game, settings)
    },
    stop: () => {},
    gameGone: () => feed.close()
  }
}
