// The fallback for any game: the vision model looks at the whole screen, but only when a cheap
// check on a tiny frame suggests something changed, and never more often than the pace allows,
// so the GPU stays free for the game.
import { captureDisplayImage } from '../../windows/capture'
import type { GameProfile } from '../../games/catalog'
import type { Settings } from '../../system/settings'
import type { ObservedEvent } from '../../../shared/types'
import { analysisGapMs } from '../../companion/director'
import { EVENT_RULES, normalizeVisionReport, visionEventTypes } from '../../companion/events'
import { visionGame, type AdapterHost, type GameAdapter } from '../adapter'
import { gamePlace } from '../gameWindow'
import {
  DIFF_FRAME_WIDTH,
  MAX_ANALYSIS_GAP_MS,
  frameStats,
  lookTimes,
  readLook,
  sceneChange,
  watchWithModel,
  type FrameStats
} from './modelLook'

// Something urgent (a red flash: damage or death) may be checked sooner.
const URGENT_ANALYSIS_GAP_MS = 5_000
// Mean per-pixel brightness change (0-1) that counts as a new scene.
const SCENE_CHANGE_THRESHOLD = 0.08
const COMMENTARY_WIDTH = 768
const MAX_EVENTS_PER_LOOK = 3
export const TICK_MS = 4_000

// What the model must reply with: the facts of one look, in the shape normalizeVisionReport reads.
export function analysisSchema(game: GameProfile): object {
  const text = (maxLength: number): object => ({ type: 'string', maxLength })
  const score = { type: 'integer', minimum: -1, maximum: 999 }
  return {
    type: 'object',
    properties: {
      phase: { type: 'string', enum: ['playing', 'intermission', 'menu'] },
      in_fight: { type: 'boolean' },
      own_score: score,
      enemy_score: score,
      description: text(160),
      events: {
        type: 'array',
        maxItems: MAX_EVENTS_PER_LOOK,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: visionEventTypes(visionGame(game)) },
            sure: { type: 'boolean' },
            importance: { type: 'integer', minimum: 0, maximum: 10 },
            detail: text(120),
            opponent: text(32),
            place: text(32),
            count: { type: 'integer', minimum: 1, maximum: 10 }
          },
          required: ['type', 'sure', 'importance', 'detail', 'opponent', 'place', 'count']
        }
      }
    },
    required: ['phase', 'in_fight', 'own_score', 'enemy_score', 'description', 'events']
  }
}

// The instructions for one look at the screen. It only collects facts, in English; the reaction
// is written later, and only if the companion decides to say something.
export function analysisPrompt(
  reason: string,
  game: GameProfile,
  noticed: readonly ObservedEvent[]
): string {
  const recent = noticed
    .slice(-3)
    .map((e) => `- ${Math.round((Date.now() - e.time) / 1000)}s ago: ${e.description}`)
    .join('\n')
  const types = visionEventTypes(visionGame(game))
    .map((type) => `- ${type}: ${EVENT_RULES[type].seen}`)
    .join('\n')
  return `You are the eyes of GameMate, a companion watching someone play ${game.name}. The player is the person whose view this is. Report only what is visible in this screenshot right now.
Event types:
${types}
In ${game.name}, watch especially for: ${game.watchFor}.
Rules:
- Report at most ${MAX_EVENTS_PER_LOOK} events, most important first. If nothing happened, use an empty list: normal gameplay is not an event.
- Never report something because it is likely. A kill-feed line between other players is not the player's kill.
- Badges, icons and numbers on a kill-feed line belong to whoever made that kill, often a teammate: never report them as the player's.
- Read banners carefully: "ELIMINATED <name>" or "KILLED <name>" means the player eliminated that enemy (kill). "KILLED BY <name>", "ELIMINATED BY <name>" or "YOU DIED" means the player was eliminated (death), and only then.
- A result screen (VICTORY, DEFEAT, ROUND WON, ROUND LOST) is always an event.
- "sure": true only if text or an icon on screen clearly shows it.
- "importance": 0-10, how much a player would care.
- "detail": one short factual note in English, quoting the on-screen text if there is any.
- "opponent": the enemy's name exactly as printed on screen for this event, otherwise "".
- "place": a location name printed on screen, otherwise "".
- "count": how many eliminations a banner states, otherwise 1.
- "phase": "playing"; "intermission" between rounds or on a result screen; "menu" for menus, loading screens or anything that is not ${game.name}.
- "in_fight": true if the player is fighting right now.
- "own_score" and "enemy_score": rounds or goals won as shown on the screen, -1 if not visible or if you can't tell which side is the player's.
- "description": one short factual sentence in English about what is visible.
Why you are looking now: ${reason}
${recent ? `Already noticed recently (don't report the same thing again):\n${recent}` : ''}`
}

export function createVisionLook(host: AdapterHost): GameAdapter {
  let lastFrame: FrameStats | null = null

  // Why the model should look now, or null to skip this tick.
  function analysisReason(frame: FrameStats, now: number, minGapMs: number): string | null {
    const since = now - lookTimes.lastAt
    if (frame.redness > 1.8 && since >= URGENT_ANALYSIS_GAP_MS) {
      return 'The screen just turned red, which can mean the player took damage or died.'
    }
    if (since < minGapMs) return null
    if (lastFrame && frame.brightness < 0.12 && lastFrame.brightness >= 0.2) {
      return 'The screen just got much darker.'
    }
    if (!lastFrame || sceneChange(frame, lastFrame) > SCENE_CHANGE_THRESHOLD) {
      return 'The scene changed.'
    }
    if (since >= MAX_ANALYSIS_GAP_MS) return 'Routine check.'
    return null
  }

  async function analyze(
    displayId: number,
    reason: string,
    settings: Settings,
    game: GameProfile
  ): Promise<void> {
    // When it happened on screen, not when the model finished reading it.
    const capturedAt = Date.now()
    // Smaller than a screenshot sent with a question: enough to see what is happening, and the
    // model reads it much faster.
    const image = await captureDisplayImage(displayId, COMMENTARY_WIDTH)
    if (!image) return
    await readLook(
      host,
      {
        displayId,
        capturedAt,
        images: [image],
        prompt: analysisPrompt(reason, game, host.recentEvents()),
        schema: analysisSchema(game),
        read: (reply, time) => normalizeVisionReport(reply, time)
      },
      settings,
      game
    )
  }

  async function look(settings: Settings, game: GameProfile, handle: bigint): Promise<void> {
    const { display } = gamePlace(handle)
    const small = await captureDisplayImage(display.id, DIFF_FRAME_WIDTH)
    if (!small) return
    const frame = frameStats(small)
    const now = Date.now()
    const minGapMs = analysisGapMs(settings.commentaryFrequency, host.inFight(), lookTimes.lastMs)
    const reason = analysisReason(frame, now, minGapMs)
    if (!reason) return

    lookTimes.lastAt = now
    lastFrame = frame
    await analyze(display.id, reason, settings, game)
  }

  return {
    id: 'vision-look',
    // Serves any game, so it is the fallback.
    matches: () => 1,
    tickMs: TICK_MS,
    watch: (settings, game, handle) =>
      watchWithModel(host, settings, game, () => look(settings, game, handle)),
    stop: () => {},
    gameGone: () => {
      lastFrame = null
    }
  }
}
