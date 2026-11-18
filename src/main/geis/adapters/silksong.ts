// Hollow Knight: Silksong is followed without the vision model, which invented events there: a
// live stream of the game window is measured a few times a second (screenWatch.ts), the
// measurements become moments (silksongTracker.ts), and only titles and pickups are read as
// text, offline, and matched to known names.
import { closeSync, fstatSync, openSync, readSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import {
  grabRegion,
  screenWatching,
  startScreenWatch,
  stopScreenWatch
} from '../../windows/screenWatch'
import { readText } from '../../system/ocr'
import { screenPack, type GameProfile } from '../../games/catalog'
import type { Settings } from '../../system/settings'
import {
  isBlackFrame,
  SILKSONG_LAYOUT,
  type SilksongMeasure
} from '../../../shared/screen/silksong'
import { makeEvent, type FrameReport, type GameEvent } from '../../companion/events'
import { matchName } from '../../companion/names'
import { silksongNames } from '../../companion/silksongNames'
import { SilksongTracker } from '../../companion/silksongTracker'
import { READ_PICKUPS } from '../../companion/silksongSwitches'
import type { Box } from '../../companion/hudAreas'
import type { AdapterHost, GameAdapter } from '../adapter'
import { gamePlace } from '../gameWindow'
import { TICK_MS } from './visionLook'
import { pipelineTap } from '../tap'

// How sure the screen checks are, from the owner's footage: the mask count, the death sequence
// and titles matched to a known name never invented anything there. Text read off a pickup
// spot has no list to match against.
const CHECK_CONFIDENCE = 0.9
const NAME_MATCH_CONFIDENCE = 0.9
const PICKUP_TEXT_CONFIDENCE = 0.6
// Leaving a boss arena alive is not seeing the boss beaten: worked out, and switched off.
const GUESSED_WIN_CONFIDENCE = 0.5
const checked = { confidence: CHECK_CONFIDENCE }

// A pickup's name is short; longer text is a description or a misread.
const PICKUP_MAX_LENGTH = 40
// The same pickup text this soon again is the same pickup shown again.
const PICKUP_REPEAT_MS = 5 * 60_000
// Player.log is written anew at every start of the game and stays small; only its end is read,
// and never more than this.
const MAX_LOG_BYTES = 1024 * 1024
// A 1x1 picture, read once when watching starts so the first real read doesn't wait for the
// text recognition helper to start (about half a second).
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/** The language Silksong is set to, from the newest line of its Player.log that names one. */
export function silksongLanguage(log: string): string {
  let code: string | null = null
  for (const match of log.matchAll(
    /Loaded saved language code '([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)'/g
  )) {
    code = match[1]
  }
  return code ? code.replace(/_/g, '-').toLowerCase() : 'en'
}

// Only this one log file is read, and only its end: never the game's other files or its process.
function playerLogLanguage(): string {
  const path = join(
    app.getPath('home'),
    'AppData',
    'LocalLow',
    'Team Cherry',
    'Hollow Knight Silksong',
    'Player.log'
  )
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const length = Math.min(size, MAX_LOG_BYTES)
    const tail = Buffer.alloc(length)
    readSync(fd, tail, 0, length, size - length)
    return silksongLanguage(tail.toString('utf8'))
  } catch {
    // No log yet (the game never ran here) or it can't be read.
    return 'en'
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

// GameMate's log file (on this PC only) notes what the screen watch saw, so a play session can
// be checked against it afterwards. Names and the game's own text only, never a frame.
function screenLog(message: string): void {
  console.info(`Screen: ${message}`)
  pipelineTap.record({
    at: Date.now(),
    stage: 'observation',
    adapterId: 'silksong',
    summary: message
  })
}

// One stretch of watching one game window. Anything still underway for an older one is dropped.
interface ScreenRun {
  game: GameProfile
  handle: bigint
  // What the game's text is written in, for reading it.
  language: string
}

export function createSilksong(host: AdapterHost): GameAdapter {
  const tracker = new SilksongTracker()
  let screenRun: ScreenRun | null = null
  // The capture shows only black (exclusive fullscreen): the player is told until a frame shows.
  let blocked = false
  // Where the player is and which boss they face, as last read off the screen.
  let currentArea = ''
  let currentBoss = ''
  const pickupsSeen = new Map<string, number>()

  async function followScreen(
    settings: Settings,
    game: GameProfile,
    handle: bigint
  ): Promise<void> {
    const same = screenRun?.game.id === game.id && screenRun.handle === handle
    if (!same || !screenWatching()) startScreen(game, handle)
    host.setState({ status: blocked ? 'blocked-by-fullscreen' : 'watching', game: game.name })
    host.showCommentsOn(gamePlace(handle).display.id)
    // A comment that was waiting for a fight to end or for a cooldown may be due now.
    await host.speakIfDue(game, settings)
  }

  function startScreen(game: GameProfile, handle: bigint): void {
    endScreenWatch()
    const run: ScreenRun = { game, handle, language: playerLogLanguage() }
    screenRun = run
    screenLog(`watching ${game.name}`)
    // Started now, so the first title read later is quick.
    readText(BLANK_PNG, run.language).catch(() => {})
    silksongNames().catch(() => {})
    startScreenWatch(game, handle, (m, time) => onScreenMeasure(run, m, time)).catch((error) =>
      console.error('Could not watch the game window', error)
    )
  }

  // Leaving the game, pausing, forgetting or turning the companion off ends the stream, and what
  // the checks had built up starts over.
  function endScreenWatch(): void {
    if (!screenRun) return
    screenRun = null
    screenLog('stopped watching')
    stopScreenWatch()
    tracker.reset()
    blocked = false
    currentArea = ''
    currentBoss = ''
    pickupsSeen.clear()
  }

  function onScreenMeasure(run: ScreenRun, m: SilksongMeasure, time: number): void {
    if (screenRun !== run) return
    if (blocked && !isBlackFrame(m)) {
      blocked = false
      screenLog('the capture shows the game again')
      host.setState({ status: 'watching' })
    }
    const events: GameEvent[] = []
    let leftRoom = false
    for (const signal of tracker.push(m, time)) {
      switch (signal.kind) {
        case 'close_call':
          events.push(
            makeEvent('low_health', time, 'screen', { ...checked, detail: 'down to the last mask' })
          )
          break
        case 'recovered':
          events.push(
            makeEvent('recovery', time, 'screen', {
              ...checked,
              detail: 'back above one mask after a close call'
            })
          )
          break
        case 'death':
          // A death while a boss fight is on is put down to that boss; session memory adds which
          // attempt it was. Either way the fight is over.
          events.push(
            makeEvent('death', signal.at, 'screen', {
              ...checked,
              place: currentArea,
              opponent: currentBoss,
              detail: currentArea ? `died in ${currentArea}` : 'died'
            })
          )
          currentBoss = ''
          break
        case 'boss_defeated':
          // Worked out, never seen: the player left the arena alive after a long enough fight.
          events.push(
            makeEvent('fight_won', time, 'screen', {
              basis: 'inferred',
              confidence: GUESSED_WIN_CONFIDENCE,
              opponent: currentBoss,
              detail: currentBoss
                ? `left the arena of ${currentBoss} alive after 20+ s, likely beaten`
                : 'left the boss arena alive after 20+ s, likely beaten'
            })
          )
          currentBoss = ''
          break
        case 'room_change':
          leftRoom = true
          break
        case 'title':
          readTitle(run, signal.title, time).catch((error) =>
            console.error('Could not read a title', error)
          )
          break
        case 'pickup':
          // Switched off until the region is known to hold only pickup names.
          if (!READ_PICKUPS) break
          readPickup(run, time).catch((error) => console.error('Could not read a pickup', error))
          break
        case 'blocked':
          blocked = true
          screenLog('the capture is black')
          host.setState({ status: 'blocked-by-fullscreen' })
          break
        // Damage only tells the tracker a fight is on.
      }
    }
    // Leaving the room ended the fight as the tracker sees it, won or not, so the boss's title
    // shown again later is a new encounter.
    if (leftRoom) currentBoss = ''
    deliverScreen(run, events, time, leftRoom)
  }

  // Events from the screen go through the same pipeline as the model's; returns what was new.
  // `fightEnded` tells session memory a room change ended any boss fight, even with no events.
  function deliverScreen(
    run: ScreenRun,
    events: GameEvent[],
    time: number,
    fightEnded = false
  ): GameEvent[] {
    if ((events.length === 0 && !fightEnded) || screenRun !== run) return []
    const report: FrameReport = {
      time,
      source: 'screen',
      adapterId: 'silksong',
      phase: 'playing',
      inFight: tracker.fighting(),
      score: null,
      description: '',
      events,
      fightEnded
    }
    const fresh = host.observe(report, run.game, '')
    for (const event of fresh) screenLog(`${event.type}: ${event.detail}`)
    host.speakIfDue(run.game).catch((error) => console.error('Could not comment', error))
    return fresh
  }

  // Whether something read for this run may still be used: not once the log was cleared, the
  // companion turned off or paused, or the player left the game meanwhile.
  function stillCurrent(run: ScreenRun): () => boolean {
    const forgetsBefore = host.forgets()
    return () => screenRun === run && host.forgets() === forgetsBefore
  }

  // The text in one region of the game window, or null when there is none or it came too late.
  async function readRegion(
    run: ScreenRun,
    box: Box,
    current: () => boolean
  ): Promise<string | null> {
    try {
      const png = await grabRegion(box)
      if (!png || !current()) return null
      const lines = await readText(png, run.language)
      if (!current()) return null
      const text = lines
        .map((l) => l.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      return text || null
    } catch (error) {
      console.error('Could not read text off the screen', error)
      return null
    }
  }

  // A title is only ever a known boss or area name: text that matches none is never commented on.
  async function readTitle(run: ScreenRun, kind: 'area' | 'boss', time: number): Promise<void> {
    const current = stillCurrent(run)
    const box = kind === 'boss' ? SILKSONG_LAYOUT.bossTitle : SILKSONG_LAYOUT.areaTitle
    const text = await readRegion(run, box, current)
    if (!text) {
      if (current()) screenLog(`${kind} title showed, no text read`)
      return
    }
    const names = await silksongNames()
    if (!current()) return
    // Silksong shows area names in the bottom-left spot too (the owner's recording: "BLASTED
    // STEPS", "BONE BOTTOM"), so a title there may name a boss or an area. The centre card only
    // names areas.
    const boss = kind === 'boss' ? matchName(text, names.bosses) : null
    const name = boss ?? matchName(text, names.areas)
    // The game's own text, cut short: enough to see what the recognition made of it.
    screenLog(`${kind} title read as "${text.slice(0, 60)}", ${name ?? 'no known name'}`)
    if (!name) return
    if (!boss) {
      currentArea = name
      // A new place means the fight there is over (session memory forgets the boss too), so a
      // death from here on is not put down to it.
      if (currentBoss) {
        currentBoss = ''
        tracker.setBoss(null)
      }
      const entered = makeEvent('area_entered', time, 'screen', {
        confidence: NAME_MATCH_CONFIDENCE,
        place: name,
        detail: `entered ${name}`
      })
      deliverScreen(run, [entered], time)
      return
    }
    // A title shown again in the same fight (no death or win since) is no new attempt: it gives
    // no event and leaves the fight's clock running. A new boss, or one whose fight a death or a
    // win ended, is a new encounter, and its clock starts now.
    if (currentBoss === name) return
    currentBoss = name
    tracker.setBoss(name)
    const encounter = makeEvent('boss_encounter', time, 'screen', {
      confidence: NAME_MATCH_CONFIDENCE,
      opponent: name,
      detail: `facing ${name}`
    })
    deliverScreen(run, [encounter], time)
  }

  async function readPickup(run: ScreenRun, time: number): Promise<void> {
    const current = stillCurrent(run)
    const text = await readRegion(run, SILKSONG_LAYOUT.pickup, current)
    if (!text || !/\p{L}/u.test(text) || text.length > PICKUP_MAX_LENGTH) return
    for (const [seen, at] of pickupsSeen) {
      if (time - at >= PICKUP_REPEAT_MS) pickupsSeen.delete(seen)
    }
    const key = text.toLowerCase()
    if (pickupsSeen.has(key)) return
    pickupsSeen.set(key, time)
    deliverScreen(
      run,
      [
        makeEvent('milestone', time, 'screen', { confidence: PICKUP_TEXT_CONFIDENCE, detail: text })
      ],
      time
    )
  }

  return {
    id: 'silksong',
    matches: (game) => (screenPack(game) === 'silksong' ? 3 : 0),
    checks: ['low_health', 'recovery', 'death', 'area_entered', 'boss_encounter'],
    // The stream brings moments as they happen; the tick only keeps the status and lets a
    // waiting comment out.
    tickMs: TICK_MS,
    watch: followScreen,
    stop: endScreenWatch
  }
}
