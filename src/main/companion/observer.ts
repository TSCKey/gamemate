// Always-on companion: watches the game in front in the background. How a game is followed is
// up to its adapter (src/main/geis/adapters): light screen checks for Silksong, the vision model
// on the kill feed for games with a known layout, the vision model on the whole screen for the
// rest. What an adapter reports goes through the commentary pipeline (commentator.ts), which
// decides whether to say something and writes it.
//
// This file only schedules: it checks the player's settings and consent, finds the game in
// front, starts the adapter that serves it and stops the others.
import { BrowserWindow } from 'electron'
import { followForegroundGame } from '../games/current'
import type { GameProfile } from '../games/catalog'
import { complete } from '../ai/llm'
import { commentaryWriterFor, engineFor, engineReady, writeComment } from '../ai/engines'
import { isAsking } from '../ai/assistant'
import { getSettings, onSettingsChanged, termsAccepted, type Settings } from '../system/settings'
import { EVENT_TYPES } from '../../shared/types'
import type { CompanionState, CompanionStatus, EventType, ObservedEvent } from '../../shared/types'
import { Commentator, type CommentaryOptions } from './commentator'
import { EVENT_RULES, type GameEvent } from './events'
import { certainty } from './reaction'
import { hudAreas } from './hudAreas'
import type { MatchContext } from './matchMemory'
import { adapterFor, visionGame, type AdapterHost, type GameAdapter } from '../geis/adapter'
import { createAdapters } from '../geis/adapters'
import { TICK_MS, analysisPrompt as visionPrompt } from '../geis/adapters/visionLook'
export { analysisSchema } from '../geis/adapters/visionLook'
export { areaPrompt, areaSchema } from '../geis/adapters/killfeed'
export { silksongLanguage } from '../geis/adapters/silksong'
export { EVENT_TYPES }
export type { EventType, ObservedEvent }

const MAX_EVENTS = 30

export type ObserverState = CompanionState
export type ObserverStatus = CompanionStatus

let state: ObserverState = { status: 'off', game: null, paused: false, events: [] }
let timer: NodeJS.Timeout | null = null
// How often the loop comes back: the adapter watching last says.
let tickMs = TICK_MS
// Goes up whenever what GameMate saw must be forgotten, so a look still underway can tell.
let forgetCount = 0
let commentDisplay = 0
let showComment: (text: string, displayId: number) => void = () => {}
const stateListeners: ((state: ObserverState) => void)[] = []

const commentator = new Commentator({
  generate: async (prompt) => {
    const writer = commentaryWriterFor(getSettings())
    if (writer) {
      try {
        return await writeComment(writer, prompt)
      } catch (error) {
        // The main model writes this one instead.
        console.warn('The comment writer could not write a comment:', error)
      }
    }
    return (
      await complete(engineFor('commentary'), [{ role: 'user', content: prompt }], { fast: true })
    ).content
  },
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

// Whether a patch would change anything (an empty list of events stays an empty list).
export function changes(current: ObserverState, patch: Partial<ObserverState>): boolean {
  return (Object.keys(patch) as (keyof ObserverState)[]).some((key) => {
    const [was, now] = [current[key], patch[key]]
    return was !== now && !(Array.isArray(was) && Array.isArray(now) && !was.length && !now.length)
  })
}

function setState(patch: Partial<ObserverState>): void {
  // Every look at the game ends here; the windows and the tray only hear about real changes.
  if (!changes(state, patch)) return
  state = { ...state, ...patch }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('companion:state', state)
  for (const listener of stateListeners) listener(state)
}

// The instructions for one whole-screen look, with what was already noticed.
export function analysisPrompt(reason: string, game: GameProfile): string {
  return visionPrompt(reason, game, state.events)
}

export function commentaryOptions(settings: Settings, game: GameProfile): CommentaryOptions {
  return {
    frequency: settings.commentaryFrequency,
    intensity: settings.commentaryIntensity,
    humor: settings.commentaryHumor,
    categories: settings.commentaryCategories,
    // Where only the feed is watched, the companion only ever reacts.
    tactics: settings.commentaryTactics && hudAreas(game.name) === null,
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

// The pipeline as the adapters see it.
const host: AdapterHost = {
  observe: (report, game, fallback) => {
    const adapter = adapters.find((a) => a.id === report.adapterId)
    const fresh = commentator.observe(report, visionGame(game), new Set(adapter?.checks))
    logEvents(fresh, fallback)
    return fresh
  },
  speakIfDue: async (game, settings = getSettings()) => {
    await commentator.speakIfDue(commentaryOptions(settings, game))
  },
  showCommentsOn: (displayId) => {
    commentDisplay = displayId
  },
  setState,
  status: () => state.status,
  recentEvents: () => state.events,
  inFight: () => commentator.isInFight(),
  forgets: () => forgetCount
}

const adapters: GameAdapter[] = createAdapters(host)

// Whenever the companion is not watching a game, no adapter watches either.
function stopAdapters(except?: GameAdapter): void {
  for (const adapter of adapters) {
    if (adapter === except) continue
    try {
      adapter.stop()
    } catch (error) {
      console.error(`Adapter ${adapter.id} could not stop`, error)
    }
  }
}

async function tick(): Promise<void> {
  tickMs = TICK_MS
  const settings = getSettings()
  const stop = (patch: Partial<ObserverState>): void => {
    stopAdapters()
    setState(patch)
  }
  if (!observes(settings)) return stop({ status: 'off', game: null })
  if (state.paused) return stop({ status: 'paused' })
  if (!engineReady('commentary')) return stop({ status: 'no-model' })

  // Only watch while a game is the window in front: not while alt-tabbed or in GameMate.
  // Telling which game is in front needs the player's OK.
  if (!settings.deviceConsent) return stop({ status: 'needs-consent', game: null })
  const found = followForegroundGame()
  if (!found) {
    for (const adapter of adapters) adapter.gameGone?.()
    return stop({ status: 'waiting-for-game', game: null })
  }
  const { game, program } = found
  const adapter = adapterFor(adapters, game)
  stopAdapters(adapter)
  tickMs = adapter.tickMs
  await adapter.watch(settings, game, program.handle)
}

const nextTickMs = (): number => tickMs

function loop(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      await tick()
    } catch (error) {
      console.error('Observer tick failed', error)
    }
    if (timer) loop()
  }, nextTickMs())
}

export function startObserver(onComment: (text: string, displayId: number) => void): void {
  showComment = onComment
  onSettingsChanged((settings) => {
    // Turning observation off forgets everything GameMate saw.
    if (!observes(settings) || !settings.deviceConsent) forget()
    // Nothing runs in the background while the companion isn't watching.
    if (observes(settings)) {
      if (!timer) loop()
    } else {
      stopObserver()
    }
    tick().catch((error) => console.error('Observer tick failed', error))
  })
  if (observes(getSettings())) loop()
}

export function stopObserver(): void {
  if (timer) clearTimeout(timer)
  timer = null
  stopAdapters()
}

export function getObserverState(): ObserverState {
  return state
}

export function setPaused(paused: boolean): void {
  if (paused) stopAdapters()
  setState({
    paused,
    status: paused ? 'paused' : state.status === 'paused' ? 'waiting-for-game' : state.status
  })
}

function forget(): void {
  forgetCount++
  stopAdapters()
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

// Recent moments for answering the player's questions, newest last: from this session's
// history, bigger moments included, with anything not seen for certain marked as such.
export function recentObservations(maxAgeMs = 10 * 60_000): string[] {
  const now = Date.now()
  const shown = new Map(state.events.map((e) => [e.id, e.description]))
  return commentator
    .history()
    .filter((e) => e.status === 'accepted' && now - e.time <= maxAgeMs)
    .slice(-5)
    .map((e) => {
      const text = e.detail || shown.get(e.id) || EVENT_RULES[e.type].meaning
      const likely = certainty(e) === 'likely' ? ' (likely, not certain)' : ''
      return `${Math.max(1, Math.round((now - e.time) / 60_000))} min ago: ${text}${likely}`
    })
}
