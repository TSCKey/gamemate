// Always-on companion: watches the game in the background and notices what happens with the
// vision model. What that model reports goes through the commentary pipeline (commentator.ts),
// which decides whether to say something and writes it.
//
// To keep the GPU free for the game, the model is only asked about the screen when a cheap
// check on a tiny frame suggests something changed, and never more often than MIN_ANALYSIS_GAP_MS.
import { BrowserWindow, screen, type NativeImage } from 'electron'
import { captureDisplayImage, toScreenshot } from '../windows/capture'
import { windowRect } from '../system/foreground'
import { followForegroundGame } from '../games/current'
import type { GameProfile } from '../games/catalog'
import { complete } from '../ai/llm'
import { engineFor, engineReady } from '../ai/engines'
import { isAsking } from '../ai/assistant'
import { getSettings, onSettingsChanged, termsAccepted, type Settings } from '../system/settings'
import { EVENT_TYPES } from '../../shared/types'
import type { CompanionState, CompanionStatus, EventType, ObservedEvent } from '../../shared/types'
import { Commentator, type CommentaryOptions } from './commentator'
import { analysisGapMs } from './director'
import {
  EVENT_RULES,
  normalizeVisionReport,
  visionEventTypes,
  type GameEvent,
  type VisionGame
} from './events'
import type { MatchContext } from './matchMemory'
export { EVENT_TYPES }
export type { EventType, ObservedEvent }

const TICK_MS = 4_000
// Something urgent (a red flash: damage or death) may be checked sooner.
const URGENT_ANALYSIS_GAP_MS = 5_000
// Even if the scene looks the same, take a fresh look this often.
const MAX_ANALYSIS_GAP_MS = 60_000
// Mean per-pixel brightness change (0-1) that counts as a new scene.
const SCENE_CHANGE_THRESHOLD = 0.08
const DIFF_FRAME_WIDTH = 64
const COMMENTARY_WIDTH = 768
const MAX_EVENTS = 30
const MAX_EVENTS_PER_LOOK = 3

export type ObserverState = CompanionState
export type ObserverStatus = CompanionStatus

interface FrameStats {
  pixels: Float32Array
  brightness: number
  redness: number
}

const visionGame = (game: GameProfile): VisionGame => ({
  id: game.id,
  name: game.name,
  competitive: Boolean(game.competitive)
})

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

let state: ObserverState = { status: 'off', game: null, paused: false, events: [] }
let timer: NodeJS.Timeout | null = null
let lastFrame: FrameStats | null = null
let lastAnalysisAt = 0
let lastAnalysisMs = 0
let lookingNow = false
// Goes up whenever what GameMate saw must be forgotten, so a look still underway can tell.
let forgetCount = 0
let commentDisplay = 0
let showComment: (text: string, displayId: number) => void = () => {}
const stateListeners: ((state: ObserverState) => void)[] = []

const commentator = new Commentator({
  generate: async (prompt) =>
    (await complete(engineFor('commentary'), [{ role: 'user', content: prompt }], { fast: true }))
      .content,
  deliver: deliverComment,
  // The player's question gets the GPU first, and nothing is said once they have left the game.
  canSpeak: () =>
    getSettings().companionMode === 'commentary' &&
    !state.paused &&
    state.game !== null &&
    !isAsking()
})

// Watching needs a watching mode and accepted Terms of Use.
const observes = (s: Settings): boolean =>
  termsAccepted(s) &&
  (s.companionMode === 'observation' ||
    s.companionMode === 'commentary' ||
    s.companionMode === 'quiet')

function setState(patch: Partial<ObserverState>): void {
  state = { ...state, ...patch }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('companion:state', state)
  for (const listener of stateListeners) listener(state)
}

// Tiny grayscale frame plus overall brightness and how red the screen is
// (Minecraft flashes red when you take damage and the death screen is red).
function frameStats(image: NativeImage): FrameStats {
  const small = image.resize({ width: DIFF_FRAME_WIDTH, quality: 'good' })
  const bitmap = small.toBitmap() // BGRA
  const count = bitmap.length / 4
  const pixels = new Float32Array(count)
  let brightness = 0
  let red = 0
  let other = 0
  for (let i = 0; i < count; i++) {
    const b = bitmap[i * 4] / 255
    const g = bitmap[i * 4 + 1] / 255
    const r = bitmap[i * 4 + 2] / 255
    pixels[i] = 0.299 * r + 0.587 * g + 0.114 * b
    brightness += pixels[i]
    red += r
    other += (g + b) / 2
  }
  return { pixels, brightness: brightness / count, redness: red / Math.max(other, 1e-6) }
}

function sceneChange(a: FrameStats, b: FrameStats): number {
  if (a.pixels.length !== b.pixels.length) return 1
  let diff = 0
  for (let i = 0; i < a.pixels.length; i++) diff += Math.abs(a.pixels[i] - b.pixels[i])
  return diff / a.pixels.length
}

// Why the model should look now, or null to skip this tick.
function analysisReason(frame: FrameStats, now: number, minGapMs: number): string | null {
  const since = now - lastAnalysisAt
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

// The instructions for one look at the screen. It only collects facts, in English; the reaction
// is written later, and only if the companion decides to say something.
export function analysisPrompt(reason: string, game: GameProfile): string {
  const recent = state.events
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

function commentaryOptions(settings: Settings, game: GameProfile): CommentaryOptions {
  return {
    frequency: settings.commentaryFrequency,
    intensity: settings.commentaryIntensity,
    humor: settings.commentaryHumor,
    categories: settings.commentaryCategories,
    tactics: settings.commentaryTactics,
    language: settings.language || 'en',
    game: visionGame(game)
  }
}

// A comment goes on the newest thing it is about in the log.
function deliverComment(text: string, events: GameEvent[]): void {
  const newest = events[events.length - 1]?.id
  setState({
    events: state.events.map((e) => (e.id === newest ? { ...e, spoken: true, comment: text } : e))
  })
  showComment(text, commentDisplay)
}

function logEvents(events: GameEvent[], fallback: string): void {
  if (events.length === 0) return
  const logged = events.map((e, i): ObservedEvent => ({
    id: e.id,
    // Several events can come from one look.
    time: e.time + i,
    type: e.type,
    importance: e.importance,
    description: e.detail || fallback,
    comment: '',
    spoken: false
  }))
  setState({ events: [...state.events, ...logged].slice(-MAX_EVENTS) })
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
  const forgetsBefore = forgetCount
  setState({ status: 'analyzing' })
  try {
    const reply = await complete(
      engineFor('commentary'),
      [
        {
          role: 'user',
          content: analysisPrompt(reason, game),
          images: [toScreenshot(image).base64]
        }
      ],
      // Thinking would make each look take several times longer.
      { jsonSchema: analysisSchema(game), fast: true }
    )
    lastAnalysisMs = Date.now() - capturedAt
    // The player turned the companion off or deleted their data while the model was reading.
    if (forgetCount !== forgetsBefore) return
    const report = normalizeVisionReport(JSON.parse(reply.content), capturedAt)
    logEvents(commentator.observe(report, visionGame(game)), report.description)
    commentDisplay = displayId
    await commentator.speakIfDue(commentaryOptions(settings, game))
  } catch (error) {
    console.error('Observation failed', error)
  } finally {
    if (state.status === 'analyzing') setState({ status: 'watching' })
  }
}

async function tick(): Promise<void> {
  const settings = getSettings()
  if (!observes(settings)) return setState({ status: 'off', game: null })
  if (state.paused) return setState({ status: 'paused' })
  if (!engineReady('commentary')) return setState({ status: 'no-model' })

  // Only watch while a game is the window in front: not while alt-tabbed or in GameMate.
  // Telling which game is in front needs the player's OK.
  if (!settings.deviceConsent) return setState({ status: 'needs-consent', game: null })
  const found = followForegroundGame()
  if (!found) {
    lastFrame = null
    return setState({ status: 'waiting-for-game', game: null })
  }
  const { game, program } = found
  setState({ status: 'watching', game: game.name })
  // The player asked something: their question gets the GPU first.
  if (isAsking() || lookingNow) return
  lookingNow = true
  try {
    await lookAtGame(settings, game, program.handle)
  } finally {
    lookingNow = false
  }
}

async function lookAtGame(
  settings: Settings,
  game: GameProfile,
  handle: Parameters<typeof windowRect>[0]
): Promise<void> {
  // A comment that was waiting for a fight to end or for a cooldown may be due now.
  await commentator.speakIfDue(commentaryOptions(settings, game))

  const rect = windowRect(handle)
  const display = rect
    ? screen.getDisplayMatching(
        screen.screenToDipRect(null, {
          x: rect.left,
          y: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top
        })
      )
    : screen.getPrimaryDisplay()
  const small = await captureDisplayImage(display.id, DIFF_FRAME_WIDTH * 2)
  if (!small) return
  const frame = frameStats(small)
  const now = Date.now()
  const minGapMs = analysisGapMs(
    settings.commentaryFrequency,
    commentator.isInFight(),
    lastAnalysisMs
  )
  const reason = analysisReason(frame, now, minGapMs)
  if (!reason) return

  lastAnalysisAt = now
  lastFrame = frame
  await analyze(display.id, reason, settings, game)
}

function loop(): void {
  timer = setTimeout(async () => {
    try {
      await tick()
    } catch (error) {
      console.error('Observer tick failed', error)
    }
    if (timer) loop()
  }, TICK_MS)
}

export function startObserver(onComment: (text: string, displayId: number) => void): void {
  showComment = onComment
  onSettingsChanged((settings) => {
    // Turning observation off forgets everything GameMate saw.
    if (!observes(settings) || !settings.deviceConsent) forget()
    tick().catch((error) => console.error('Observer tick failed', error))
  })
  loop()
}

export function stopObserver(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

export function getObserverState(): ObserverState {
  return state
}

export function setPaused(paused: boolean): void {
  setState({
    paused,
    status: paused ? 'paused' : state.status === 'paused' ? 'waiting-for-game' : state.status
  })
}

function forget(): void {
  forgetCount++
  commentator.reset()
  if (state.events.length > 0) setState({ events: [] })
}

export function clearEvents(): void {
  forget()
}

// What the companion remembers about the current match.
export function matchContext(): MatchContext {
  return commentator.context()
}

export function onObserverState(listener: (state: ObserverState) => void): void {
  stateListeners.push(listener)
}

// Recent observations for answering the player's questions, newest last.
export function recentObservations(maxAgeMs = 10 * 60_000): string[] {
  const now = Date.now()
  return state.events
    .filter((e) => now - e.time <= maxAgeMs)
    .slice(-5)
    .map((e) => `${Math.max(1, Math.round((now - e.time) / 60_000))} min ago: ${e.description}`)
}
