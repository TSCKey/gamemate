// Games with a known HUD layout: the vision model only copies the text in the parts of the
// screen that say what happened (the kill feed and the banner), and areaReading.ts works out
// what it means. The parts are only read when something in them moved.
import type { Display, NativeImage } from 'electron'
import type { OcrSegment } from '../../ocr/paddleOcr'
import { captureDisplayImage } from '../../windows/capture'
import type { GameProfile } from '../../games/catalog'
import type { Settings } from '../../system/settings'
import { areaLookGapMs } from '../../companion/director'
import { BANNER_KINDS, parsePlayerNames, readAreas } from '../../companion/areaReading'
import {
  cropBox,
  gameFrame,
  hudAreas,
  readsTeamBar,
  readsText,
  type Area,
  type Box
} from '../../companion/hudAreas'
import { LastAliveWatch } from '../../companion/lastAlive'
import type { FrameReport } from '../../companion/events'
import { teamBarBox, teammatesAlive } from './teamBar'
import { paddleReady, readWithPaddle } from '../../ocr/paddle'
import { bannerParts, feedLines } from '../../ocr/feedText'
import type { AdapterHost, GameAdapter } from '../adapter'
import { gamePlace } from '../gameWindow'
import {
  MAX_ANALYSIS_GAP_MS,
  frameStats,
  lookTimes,
  readLook,
  sceneChange,
  watchWithModel,
  type FrameStats
} from './modelLook'

// Feed lines fade after a few seconds, so games with a known feed are checked more often.
const AREA_TICK_MS = 2_000
// Feed text is small: the parts that get cut out need the capture at full size.
const AREA_CAPTURE_WIDTH = 1920
// A new feed line changes this much of those parts; a screen that stands still, almost none.
const AREA_CHANGE_THRESHOLD = 0.004

const AREA_NAMES: Record<Area['kind'], string> = {
  feed: "the game's kill feed, listing eliminations",
  banner: 'where the game shows banners, such as round results and eliminations'
}

// The instructions for one look at just the parts of the screen that say what happened. The
// model only copies text; areaReading.ts works out what it means.
export function areaPrompt(areas: Area[]): string {
  const images = areas.map((area, i) => `Image ${i + 1}: ${AREA_NAMES[area.kind]}.`).join('\n')
  return `You read text off parts of a game's screen. Copy only what is written. Never guess.
${images}
In the kill feed, each line has a name on the left, then a name on the right.
- "feed_lines": one entry per feed line, top to bottom, with the two names exactly as written. Empty list if there are no lines.
- "banner_text": the big banner text exactly as written, "" if there is no banner.
- "banner_kind": "eliminated_enemy" if the banner says the player eliminated someone, "killed_by" if it says the player was eliminated, otherwise "none". Round and match results are "none" too.
- "banner_name": the name in that banner, "" if it has none.`
}

export function areaSchema(): object {
  const text = (maxLength: number): object => ({ type: 'string', maxLength })
  return {
    type: 'object',
    properties: {
      feed_lines: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: { left: text(32), right: text(32) },
          required: ['left', 'right']
        }
      },
      banner_text: text(60),
      banner_kind: { type: 'string', enum: BANNER_KINDS },
      banner_name: text(32)
    },
    required: ['feed_lines', 'banner_text', 'banner_kind', 'banner_name']
  }
}

// What the text reader found in the feed and banner, in the vision model's reply shape. Who was
// eliminated by whom isn't read from a banner, only from the feed.
export async function readAreasText(
  areas: Area[],
  images: NativeImage[],
  read: (image: NativeImage, large: boolean) => Promise<OcrSegment[]> = readWithPaddle
): Promise<unknown> {
  const found = await Promise.all(images.map((image, i) => read(image, areas[i].kind === 'banner')))
  const of = (kind: Area['kind']): OcrSegment[] =>
    found.flatMap((segments, i) => (areas[i].kind === kind ? segments : []))
  const banner = bannerParts(of('banner'))
  return {
    feed_lines: feedLines(of('feed')),
    banner_text: banner.headline,
    banner_kind: 'none',
    // Under a clutch or ace banner, the name of who did it.
    banner_name: banner.below
  }
}

// How many of the player's team are alive, read off the capture's top bar.
function teamCount(image: NativeImage, frame: Box): number | null {
  const bar = image.crop(teamBarBox(frame))
  const { width, height } = bar.getSize()
  return teammatesAlive({ width, height, data: bar.toBitmap() })
}

export function createKillfeed(host: AdapterHost): GameAdapter {
  let lastAreas: FrameStats[] | null = null
  const lastAlive = new LastAliveWatch()

  // Looks at only the parts of the screen that say what happened in the match.
  async function lookAtAreas(
    settings: Settings,
    game: GameProfile,
    display: Display,
    gameWindow: Box | null,
    areas: Area[]
  ): Promise<void> {
    const capturedAt = Date.now()
    const since = capturedAt - lookTimes.lastAt
    if (since < areaLookGapMs(settings.commentaryFrequency, lookTimes.lastMs)) return
    const image = await captureDisplayImage(display.id, AREA_CAPTURE_WIDTH)
    if (!image) return
    const size = image.getSize()
    const frame = gameFrame(gameWindow, display.bounds, size)
    const crops = areas.map((area) => image.crop(cropBox(area, frame, size)))
    // Read on every look: it is a few pixels, and a count needs two looks in a row to change.
    const team = readsTeamBar(game.name) ? teamCount(image, frame) : null

    // Not worth the GPU while nothing in them moves, such as in a menu or a paused game.
    const stats = crops.map(frameStats)
    const previous = lastAreas
    const changed =
      !previous || stats.some((s, i) => sceneChange(s, previous[i]) > AREA_CHANGE_THRESHOLD)
    if (!changed && since < MAX_ANALYSIS_GAP_MS) {
      const moments = team === null ? [] : lastAlive.absorb(capturedAt, team, [])
      if (moments.length > 0) {
        const report: FrameReport = {
          time: capturedAt,
          source: 'vision',
          adapterId: 'killfeed',
          phase: 'playing',
          inFight: false,
          score: null,
          description: '',
          events: moments
        }
        host.observe(report, game, '')
        host.showCommentsOn(display.id)
        await host.speakIfDue(game, settings)
      }
      return
    }

    lastAreas = stats
    lookTimes.lastAt = capturedAt
    await readLook(
      host,
      {
        adapterId: 'killfeed',
        displayId: display.id,
        capturedAt,
        images: crops,
        prompt: areaPrompt(areas),
        schema: areaSchema(),
        read: (reply, time) => {
          const report = readAreas(reply, time, parsePlayerNames(settings.commentaryPlayerNames))
          if (!readsTeamBar(game.name)) return report
          return {
            ...report,
            events: [...report.events, ...lastAlive.absorb(time, team, report.events)]
          }
        },
        // With the text reader downloaded, a game whose feed it was checked on needs no vision
        // model: it reads the names, and the banner's words decide round results as before.
        ...(readsText(game.name) && paddleReady()
          ? { readWithout: (images) => readAreasText(areas, images), reader: 'the text reader' }
          : {})
      },
      settings,
      game
    )
  }

  return {
    id: 'killfeed',
    matches: (game) => (hudAreas(game.name) ? 2 : 0),
    tickMs: AREA_TICK_MS,
    watch: (settings, game, handle) =>
      watchWithModel(host, settings, game, async () => {
        const areas = hudAreas(game.name)
        if (!areas) return
        const { gameWindow, display } = gamePlace(handle)
        await lookAtAreas(settings, game, display, gameWindow, areas)
      }),
    stop: () => {},
    gameGone: () => {
      lastAreas = null
      lastAlive.reset()
    }
  }
}
