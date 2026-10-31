// Always-on companion: watches the game in the background, notices important moments with
// the vision model, and decides when they are worth a comment.
//
// To keep the GPU free for the game, the model is only asked about the screen when a cheap
// check on a tiny frame suggests something changed, and never more often than MIN_ANALYSIS_GAP_MS.
import { BrowserWindow, screen, type NativeImage } from 'electron'
import { captureDisplayImage, findWindow, toScreenshot } from './capture'
import { foregroundHandle, handleFromSourceId, windowRect } from './foreground'
import { GAME_WINDOW } from './games/minecraft'
import { chatOnce } from './ollamaClient'
import { isAsking } from './assistant'
import { getSettings, onSettingsChanged, type CommentaryFrequency, type Settings } from './settings'

const TICK_MS = 4_000
const MIN_ANALYSIS_GAP_MS = 12_000
// Something urgent (a red flash: damage or death) may be checked sooner.
const URGENT_ANALYSIS_GAP_MS = 5_000
// Even if the scene looks the same, take a fresh look this often.
const MAX_ANALYSIS_GAP_MS = 60_000
// Mean per-pixel brightness change (0-1) that counts as a new scene.
const SCENE_CHANGE_THRESHOLD = 0.08
const DIFF_FRAME_WIDTH = 64
const MAX_EVENTS = 30
// Don't comment on the same kind of event again this soon (deaths are always worth a word).
const SAME_EVENT_COOLDOWN_MS = 3 * 60_000

const FREQUENCY: Record<CommentaryFrequency, { cooldownMs: number; minImportance: number }> = {
  rare: { cooldownMs: 4 * 60_000, minImportance: 8 },
  normal: { cooldownMs: 90_000, minImportance: 6 },
  frequent: { cooldownMs: 40_000, minImportance: 4 }
}

export const EVENT_TYPES = [
  'none',
  'hostile_mob',
  'low_health',
  'death',
  'dark_area',
  'discovery',
  'other'
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface ObservedEvent {
  time: number
  type: Exclude<EventType, 'none'>
  importance: number
  description: string
  comment: string
  // Whether GameMate showed the comment to the player.
  spoken: boolean
}

export type ObserverStatus =
  'off' | 'paused' | 'no-model' | 'waiting-for-game' | 'watching' | 'analyzing'

export interface ObserverState {
  status: ObserverStatus
  game: string | null
  paused: boolean
  events: ObservedEvent[]
}

interface FrameStats {
  pixels: Float32Array
  brightness: number
  redness: number
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    event: { type: 'string', enum: EVENT_TYPES },
    importance: { type: 'integer', minimum: 0, maximum: 10 },
    description: { type: 'string' },
    comment: { type: 'string' }
  },
  required: ['event', 'importance', 'description', 'comment']
}

let state: ObserverState = { status: 'off', game: null, paused: false, events: [] }
let timer: NodeJS.Timeout | null = null
let lastFrame: FrameStats | null = null
let lastAnalysisAt = 0
let lastCommentAt = 0
let showComment: (text: string, displayId: number) => void = () => {}
const stateListeners: ((state: ObserverState) => void)[] = []

const observes = (s: Settings): boolean =>
  s.companionMode === 'observation' ||
  s.companionMode === 'commentary' ||
  s.companionMode === 'quiet'

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
function analysisReason(frame: FrameStats, now: number): string | null {
  const since = now - lastAnalysisAt
  if (frame.redness > 1.8 && since >= URGENT_ANALYSIS_GAP_MS) {
    return 'The screen just turned red, which can mean the player took damage or died.'
  }
  if (since < MIN_ANALYSIS_GAP_MS) return null
  if (lastFrame && frame.brightness < 0.12 && lastFrame.brightness >= 0.2) {
    return 'The screen just got much darker.'
  }
  if (!lastFrame || sceneChange(frame, lastFrame) > SCENE_CHANGE_THRESHOLD) {
    return 'The scene changed.'
  }
  if (since >= MAX_ANALYSIS_GAP_MS) return 'Routine check.'
  return null
}

function analysisPrompt(reason: string): string {
  const recent = state.events
    .slice(-3)
    .map((e) => `- ${Math.round((Date.now() - e.time) / 1000)}s ago: ${e.description}`)
    .join('\n')
  return `You are GameMate, a friendly companion watching a Minecraft player's screen. Report the single most important thing happening right now.
Event types and importance (0-10):
- death: the "You Died!" screen is shown (10)
- low_health: the health bar shows 3 hearts or fewer (9)
- hostile_mob: a creeper, zombie, skeleton, spider or other hostile mob is close to the player (7-9, higher if very close)
- discovery: a village, structure, diamonds or another notable find is clearly visible (5-7)
- dark_area: the player is in a dark cave or area where mobs can spawn (4-6)
- other: something else a player would want to know about (1-5)
- none: normal gameplay, menus, or not Minecraft (0)
"description": one short factual sentence about what is visible.
"comment": what a friendly friend sitting next to the player would say about it, under 20 words, plain text. Leave it empty for "none".
Only report what you can actually see. If unsure, use "none".
Why you are looking now: ${reason}
${recent ? `Already noticed recently (don't report the same thing again):\n${recent}` : ''}`
}

async function analyze(displayId: number, reason: string, settings: Settings): Promise<void> {
  const image = await captureDisplayImage(displayId)
  if (!image) return
  setState({ status: 'analyzing' })
  try {
    const reply = await chatOnce(
      settings.model,
      [{ role: 'user', content: analysisPrompt(reason), images: [toScreenshot(image).base64] }],
      // Thinking would make each look take several times longer.
      { format: ANALYSIS_SCHEMA, think: false }
    )
    const parsed = JSON.parse(reply.content) as {
      event?: string
      importance?: number
      description?: string
      comment?: string
    }
    const type = EVENT_TYPES.find((t) => t === parsed.event) ?? 'none'
    if (type === 'none') return

    const event: ObservedEvent = {
      time: Date.now(),
      type,
      importance: Math.max(0, Math.min(10, Math.round(Number(parsed.importance) || 0))),
      description: String(parsed.description ?? '').slice(0, 300),
      comment: String(parsed.comment ?? '').slice(0, 200),
      spoken: false
    }
    if (shouldComment(event, settings)) {
      event.spoken = true
      lastCommentAt = event.time
      showComment(event.comment, displayId)
    }
    setState({ events: [...state.events, event].slice(-MAX_EVENTS) })
  } catch (error) {
    console.error('Observation failed', error)
  } finally {
    if (state.status === 'analyzing') setState({ status: 'watching' })
  }
}

function shouldComment(event: ObservedEvent, settings: Settings): boolean {
  if (settings.companionMode !== 'commentary' || !event.comment) return false
  const { cooldownMs, minImportance } = FREQUENCY[settings.commentaryFrequency]
  if (event.importance < minImportance) return false
  if (event.type === 'death') return true
  if (event.time - lastCommentAt < cooldownMs) return false
  return !state.events.some(
    (e) => e.spoken && e.type === event.type && event.time - e.time < SAME_EVENT_COOLDOWN_MS
  )
}

async function tick(): Promise<void> {
  const settings = getSettings()
  if (!observes(settings)) return setState({ status: 'off', game: null })
  if (state.paused) return setState({ status: 'paused' })
  if (!settings.model) return setState({ status: 'no-model' })

  // GAMEMATE_GAME_WINDOW lets developers point the observer at another window for testing.
  const pattern = process.env.GAMEMATE_GAME_WINDOW
    ? new RegExp(process.env.GAMEMATE_GAME_WINDOW)
    : GAME_WINDOW
  const game = await findWindow(pattern)
  const handle = game && handleFromSourceId(game.id)
  // Only watch while the game is the window in front: not while alt-tabbed or in GameMate.
  if (!game || !handle || foregroundHandle() !== handle) {
    lastFrame = null
    return setState({ status: 'waiting-for-game', game: game?.name ?? null })
  }
  setState({ status: 'watching', game: game.name })
  // The player asked something: their question gets the GPU first.
  if (isAsking()) return

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
  const reason = analysisReason(frame, now)
  if (!reason) return

  lastAnalysisAt = now
  lastFrame = frame
  await analyze(display.id, reason, settings)
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
    if (!observes(settings) && state.events.length > 0) setState({ events: [] })
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

export function clearEvents(): void {
  setState({ events: [] })
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
