// Apex Legends with the text reader downloaded: the parts of its HUD that write out what happened
// are read on the processor (src/main/ocr), and src/main/companion/apexReading.ts works out what
// they mean. No vision model and no graphics card. Without the text reader, Apex is watched like
// the other shooters (killfeed.ts).
//
// The parts, as fractions of the game's picture, measured on the owner's 720p clips at 1080p.
// Each is only read again when something in it moved; the squad panel and the ring line, which
// rarely change, at most every few seconds.
import type { NativeImage } from 'electron'
import { captureDisplayImage } from '../../windows/capture'
import type { GameProfile } from '../../games/catalog'
import type { Settings } from '../../system/settings'
import { areaLookGapMs } from '../../companion/director'
import { parsePlayerNames } from '../../companion/areaReading'
import { ApexWatch, type ApexRead } from '../../companion/apexReading'
import { cropBox, gameFrame, type Area } from '../../companion/hudAreas'
import { paddleReady, readWithPaddle } from '../../ocr/paddle'
import type { OcrSegment, TextKind } from '../../ocr/paddleOcr'
import type { AdapterHost, GameAdapter } from '../adapter'
import { pipelineTap } from '../tap'
import { apexHudBox, readPlayerBars, readTeammates } from './apexBars'
import { gamePlace } from '../gameWindow'
import {
  frameStats,
  lookTimes,
  readLook,
  sceneChange,
  watchWithModel,
  type FrameStats
} from './modelLook'

type Part = Exclude<keyof ApexRead, 'bars'>

interface PartSpec {
  box: Omit<Area, 'kind'>
  kind: TextKind
  // Read again at least this often even when nothing seems to move (0: only on a change).
  everyMs: number
  // At most this often (0: whenever it changes).
  atMostMs: number
}

const PARTS: Record<Part, PartSpec> = {
  // The kill feed with the squad count and kill counter above it, and "AWAITING RESPAWN". Read at
  // its own size: on the owner's clips that found 230 of the 231 lines scaling it up did, a third
  // faster.
  feed: {
    box: { x: 0.7, y: 0, width: 0.3, height: 0.36 },
    kind: 'banner',
    everyMs: 0,
    atMostMs: 0
  },
  // "KNOCKED DOWN <name> +150".
  center: {
    box: { x: 0.25, y: 0.62, width: 0.5, height: 0.16 },
    kind: 'banner',
    everyMs: 0,
    atMostMs: 0
  },
  // "Knockdown Shield".
  bottom: {
    box: { x: 0.333, y: 0.796, width: 0.333, height: 0.14 },
    kind: 'banner',
    everyMs: 0,
    atMostMs: 0
  },
  // "CHAMPION SQUAD".
  top: {
    box: { x: 0.3, y: 0, width: 0.4, height: 0.075 },
    kind: 'banner',
    everyMs: 0,
    atMostMs: 0
  },
  // The squad panel: teammates' names, "DELIVER TO BEACON", "DEATHBOX RECOVERY".
  team: {
    box: { x: 0.052, y: 0.685, width: 0.167, height: 0.24 },
    kind: 'feed',
    everyMs: 30_000,
    atMostMs: 5_000
  },
  // "ROUND 1 - CLOSING 2:56" under the minimap.
  ring: {
    box: { x: 0.016, y: 0.268, width: 0.156, height: 0.083 },
    kind: 'hud',
    everyMs: 20_000,
    atMostMs: 10_000
  }
}

const PART_NAMES = Object.keys(PARTS) as Part[]
const AREA_TICK_MS = 2_000
const AREA_CAPTURE_WIDTH = 1920
const AREA_CHANGE_THRESHOLD = 0.004

export const isApex = (game: GameProfile): boolean => /^apex legends$/i.test(game.name)

// One line for the developer inspector: what the bars and cards show and which parts were read.
function describe(state: ReturnType<ApexWatch['state']>, read: string[]): string {
  const bars =
    state.health === null
      ? 'bars not on screen'
      : `health ${state.health}%, shield ${state.shield} (${state.armour ?? 'none'})`
  const squad = state.teammates.map((t) => `${t.name || '?'} ${t.state ?? '?'}`).join(', ')
  return `apex: ${bars}; squad: ${squad || 'unknown'}; squads left ${state.squadsLeft ?? '?'}${state.inFight ? '; in a fight' : ''}; read ${read.join(', ') || 'nothing'}`
}

export function createApex(host: AdapterHost): GameAdapter {
  const watch = new ApexWatch()
  let last: Partial<Record<Part, { stats: FrameStats; at: number; read: OcrSegment[] }>> = {}

  async function look(settings: Settings, game: GameProfile, handle: bigint): Promise<void> {
    const capturedAt = Date.now()
    if (
      capturedAt - lookTimes.lastAt <
      areaLookGapMs(settings.commentaryFrequency, lookTimes.lastMs)
    )
      return
    const { gameWindow, display } = gamePlace(handle)
    const image = await captureDisplayImage(display.id, AREA_CAPTURE_WIDTH)
    if (!image) return
    const size = image.getSize()
    const frame = gameFrame(gameWindow, display.bounds, size)
    const crops = Object.fromEntries(
      PART_NAMES.map((part) => [
        part,
        image.crop(cropBox({ kind: 'feed', ...PARTS[part].box }, frame, size))
      ])
    ) as Record<Part, NativeImage>

    // The health and shield bars and the squad's cards: a few thousand pixels, every look.
    const hud = image.crop(apexHudBox(frame))
    const hudSize = hud.getSize()
    const hudImage = { width: hudSize.width, height: hudSize.height, data: hud.toBitmap() }
    const bars = { player: readPlayerBars(hudImage), teammates: readTeammates(hudImage) }

    // Which parts to read this time: those that moved, or are due. With none, the bars are still
    // followed, and nothing is read.
    const due = PART_NAMES.filter((part) => {
      const spec = PARTS[part]
      const before = last[part]
      if (!before) return true
      const since = capturedAt - before.at
      if (spec.atMostMs && since < spec.atMostMs) return false
      if (spec.everyMs && since >= spec.everyMs) return true
      return sceneChange(frameStats(crops[part]), before.stats) > AREA_CHANGE_THRESHOLD
    })
    lookTimes.lastAt = capturedAt
    const images = due.map((part) => crops[part])
    await readLook(
      host,
      {
        adapterId: 'apex',
        displayId: display.id,
        capturedAt,
        images,
        prompt: '',
        schema: {},
        readWithout: async (shown) => {
          const read = await Promise.all(
            shown.map((image, i) => readWithPaddle(image, PARTS[due[i]].kind))
          )
          for (const [i, part] of due.entries()) {
            last[part] = { stats: frameStats(crops[part]), at: capturedAt, read: read[i] }
          }
          // Parts not read this time are as they were.
          const of = (part: Part): OcrSegment[] => last[part]?.read ?? []
          return {
            feed: of('feed'),
            center: of('center'),
            bottom: of('bottom'),
            top: of('top'),
            team: due.includes('team') ? of('team') : null,
            ring: due.includes('ring') ? of('ring') : null,
            bars
          } satisfies ApexRead
        },
        read: (reply, time) => {
          const names = parsePlayerNames(settings.commentaryPlayerNames)
          const report = watch.absorb(reply as ApexRead, time, names)
          if (pipelineTap.enabled) {
            pipelineTap.record({
              at: Date.now(),
              stage: 'observation',
              adapterId: 'apex',
              summary: describe(watch.state(time), due)
            })
          }
          return report
        },
        reader: 'the text reader'
      },
      settings,
      game
    )
  }

  return {
    id: 'apex',
    // Better than the vision model's look at the feed once the text reader is downloaded.
    matches: (game) => (isApex(game) && paddleReady() ? 3 : 0),
    tickMs: AREA_TICK_MS,
    watch: (settings, game, handle) =>
      watchWithModel(host, settings, game, () => look(settings, game, handle)),
    stop: () => {},
    gameGone: () => {
      last = {}
    }
  }
}
