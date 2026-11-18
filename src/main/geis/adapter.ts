// A game adapter recognizes what happens in one game, or in a class of games with one technique
// (light screen checks, the vision model on the kill feed, the vision model on the whole
// screen). Everything after recognition is shared: the observer hands what an adapter reports to
// the one commentary pipeline (commentator.ts), which remembers, decides and writes.
//
// Adapters never pace comments, write prompts or decide whether to speak, and they share no
// state with each other.
import type { GameProfile } from '../games/catalog'
import type { Settings } from '../system/settings'
import type { CompanionState, CompanionStatus, ObservedEvent } from '../../shared/types'
import type { FrameReport, GameEvent, GameEventType, VisionGame } from '../companion/events'

// What the observer gives every adapter. It is the only way back into the pipeline.
export interface AdapterHost {
  // Hands a report to the commentary pipeline; returns the events that were new, which are also
  // added to the event list the player sees (with `fallback` as their text when they have none).
  observe(report: FrameReport, game: GameProfile, fallback: string): GameEvent[]
  // Says something now if a comment is due. Settings are read fresh unless given.
  speakIfDue(game: GameProfile, settings?: Settings): Promise<void>
  // The display a comment should show up on.
  showCommentsOn(displayId: number): void
  setState(patch: Partial<CompanionState>): void
  status(): CompanionStatus
  // The event list the player sees, newest last.
  recentEvents(): readonly ObservedEvent[]
  // Whether the player is in a fight, as the pipeline remembers it.
  inFight(): boolean
  // Goes up whenever what GameMate saw must be forgotten, so work still underway can tell.
  forgets(): number
}

export interface GameAdapter {
  id: string
  // How well it serves a game: 0 = not at all. The observer picks the highest.
  matches(game: GameProfile): number
  // How often the observer comes back while this adapter watches.
  tickMs: number
  // The event types it recognizes with deterministic checks or the game's own data. Where it
  // does, a vision model's reading of the same type can't make the event on its own.
  checks?: readonly GameEventType[]
  // Called on every tick while the game is the window in front and the companion watches.
  watch(settings: Settings, game: GameProfile, handle: bigint): Promise<void>
  // Leaving the game, pausing, forgetting or turning the companion off. Must be quick and safe
  // to call when the adapter isn't watching.
  stop(): void
  // No game is in front any more: what it compared against (the last scene) is dropped too.
  gameGone?(): void
}

export const visionGame = (game: GameProfile): VisionGame => ({
  id: game.id,
  name: game.name,
  competitive: Boolean(game.competitive)
})

// The adapter that serves a game best; ties go to the one listed first.
export function adapterFor(adapters: readonly GameAdapter[], game: GameProfile): GameAdapter {
  let best = adapters[adapters.length - 1]
  let bestScore = 0
  for (const adapter of adapters) {
    const score = adapter.matches(game)
    if (score > bestScore) {
      best = adapter
      bestScore = score
    }
  }
  return best
}
