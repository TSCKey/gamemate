// Rocket League, from its own Stats API once the player has turned it on in the game's settings
// file. While it isn't on (or the game isn't listening yet), the screen is read instead, without
// any model: the scoreboard's digits from their pixels, and the game's own popups ("SHOT ON
// GOAL", "EPIC SAVE") with the text reader built into Windows (rocketScreen.ts). Both become the
// same messages and the same moments. Every few seconds this checks the game's setting and, when
// it's on, connects; once connected, the Stats API answers for the game.
import { nativeImage } from 'electron'
import type { GameProfile } from '../../games/catalog'
import { readStatsConfig, StatsFeed, type StatsApiConfig } from '../../games/rocketStats'
import { parsePlayerNames } from '../../companion/areaReading'
import { RocketWatch, type RocketMessage } from '../../companion/rocketReading'
import { readScoreboard, SCOREBOARD_STRIP, type Scoreboard } from '../../companion/rocketHud'
import { MIDDLE_AREA, PLAYER, REPLAY_AREA, RocketScreen } from '../../companion/rocketScreen'
import type { FrameReport, GameEvent } from '../../companion/events'
import { readText } from '../../system/ocr'
import {
  grabRegion,
  screenWatching,
  startScreenWatch,
  stopScreenWatch
} from '../../windows/screenWatch'
import type { Settings } from '../../system/settings'
import type { AdapterHost, GameAdapter } from '../adapter'
import { gamePlace } from '../gameWindow'
import { pipelineTap } from '../tap'

// Twice a second: the game's popups stay up for two or three seconds each.
const TICK_MS = 500
const CONFIG_MS = 30_000
// Sent many times a second, or for every touch: not told in the inspector one by one.
const QUIET = new Set(['UpdateState', 'BallHit', 'ClockUpdatedSeconds', 'BoostPickup'])
// How sure a moment read off the screen is: the game's own words and digits, matched to a fixed
// list, but read by eye.
const SCREEN_CONFIDENCE = 0.9

export const isRocketLeague = (game: GameProfile): boolean => /^rocket league$/i.test(game.name)

// The scoreboard in a grabbed picture, or unknown.
function boardOf(png: Buffer): Scoreboard | null {
  const image = nativeImage.createFromBuffer(png)
  if (image.isEmpty()) return null
  const { width, height } = image.getSize()
  return readScoreboard({ width, height, data: image.toBitmap() })
}

async function linesOf(png: Buffer | null): Promise<string[]> {
  if (!png) return []
  const lines = await readText(png)
  return lines.map((l) => l.text.trim()).filter(Boolean)
}

export function createRocketLeague(host: AdapterHost): GameAdapter {
  const feed = new StatsFeed()
  const watch = new RocketWatch()
  let config: { dir: string; at: number; value: StatsApiConfig | null } | null = null
  // The screen, while the Stats API isn't there.
  let screen = new RocketScreen()
  let screenWatch = new RocketWatch('screen', SCREEN_CONFIDENCE)
  let screenHandle: bigint | null = null
  let reading = false

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

  async function report(
    events: GameEvent[],
    time: number,
    game: GameProfile,
    settings: Settings
  ): Promise<void> {
    if (events.length > 0) {
      const ended = events.some((e) => e.type === 'victory' || e.type === 'defeat')
      const frame: FrameReport = {
        time,
        // Both ways are the game's own account of the match (the screen's events say 'screen').
        source: 'game',
        adapterId: 'rocket-league',
        phase: ended ? 'intermission' : 'playing',
        inFight: false,
        score: null,
        description: '',
        events
      }
      host.observe(frame, game, '')
    }
    await host.speakIfDue(game, settings)
  }

  function endScreen(): void {
    if (screenHandle === null) return
    screenHandle = null
    stopScreenWatch()
  }

  // One look at the screen: the scoreboard, the middle of the screen and, while a goal is being
  // put together, the replay card.
  async function lookAtScreen(
    settings: Settings,
    game: GameProfile,
    handle: bigint
  ): Promise<void> {
    if (screenHandle !== handle || !screenWatching()) {
      endScreen()
      screenHandle = handle
      // Only regions are grabbed from the stream; the measures it sends are for another game.
      startScreenWatch(game, handle, () => {}).catch((error) =>
        console.error('Could not watch the game window', error)
      )
      console.info('Rocket League: following the match on screen (the Stats API is off)')
    }
    host.setState({ status: 'watching', game: game.name })
    host.showCommentsOn(gamePlace(handle).display.id)
    if (reading) return
    reading = true
    try {
      const forgets = host.forgets()
      const time = Date.now()
      const [strip, middle, replay] = await Promise.all([
        grabRegion(SCOREBOARD_STRIP),
        grabRegion(MIDDLE_AREA),
        screen.wantsReplay() ? grabRegion(REPLAY_AREA) : Promise.resolve(null)
      ])
      const [middleLines, replayLines] = await Promise.all([linesOf(middle), linesOf(replay)])
      // Forgotten, paused or left the game while reading: nothing of it is used.
      if (host.forgets() !== forgets || screenHandle !== handle) return
      const names = [PLAYER, ...parsePlayerNames(settings.commentaryPlayerNames)]
      const look = screen.look(
        { time, board: strip ? boardOf(strip) : null, middle: middleLines, replay: replayLines },
        names
      )
      const events: GameEvent[] = []
      for (const message of look.messages) {
        tell(message)
        events.push(...screenWatch.absorb(message, message.At ?? time, [PLAYER]))
      }
      // After the messages: a goal among them takes the place of a shot held back.
      events.push(...screenWatch.tick(time))
      // Why each moment came or didn't, in the log: what was read, and what it made.
      for (const note of look.notes) {
        console.info(`Rocket League screen: ${note}`)
        if (pipelineTap.enabled) {
          pipelineTap.record({
            at: time,
            stage: 'observation',
            adapterId: 'rocket-league',
            summary: `rocket screen: ${note}`
          })
        }
      }
      if (pipelineTap.enabled) {
        for (const text of look.unknown) {
          pipelineTap.record({
            at: time,
            stage: 'observation',
            adapterId: 'rocket-league',
            summary: `rocket screen: text not known yet: "${text}"`
          })
        }
      }
      if (events.length) {
        console.info(`Rocket League screen moments: ${events.map((e) => e.type).join(', ')}`)
      }
      await report(events, time, game, settings)
    } finally {
      reading = false
    }
  }

  return {
    id: 'rocket-league',
    // The Stats API when it's connected; the screen otherwise, ahead of the kill-feed reader,
    // whose vision model took the cars' name tags for eliminations.
    matches: (game) => {
      if (!isRocketLeague(game)) return 0
      const setting = settingFor(game, Date.now())
      if (setting?.enabled) feed.ensure(setting.webPort)
      return feed.connected ? 4 : 3
    },
    tickMs: TICK_MS,
    watch: async (settings, game, handle) => {
      if (!feed.connected) return lookAtScreen(settings, game, handle)
      endScreen()
      host.setState({ status: 'watching', game: game.name })
      const names = parsePlayerNames(settings.commentaryPlayerNames)
      const events: GameEvent[] = []
      for (const message of feed.drain()) {
        tell(message)
        events.push(...watch.absorb(message, Date.now(), names))
      }
      events.push(...watch.tick(Date.now()))
      if (pipelineTap.enabled && watch.unknownStats.size > 0) {
        pipelineTap.record({
          at: Date.now(),
          stage: 'observation',
          adapterId: 'rocket-league',
          summary: `rocket: stat events not read yet: ${[...watch.unknownStats].join(', ')}`
        })
        watch.unknownStats.clear()
      }
      await report(events, Date.now(), game, settings)
    },
    stop: () => endScreen(),
    gameGone: () => {
      feed.close()
      endScreen()
      screen = new RocketScreen()
      screenWatch = new RocketWatch('screen', SCREEN_CONFIDENCE)
    }
  }
}
