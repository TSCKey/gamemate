// What the main window was showing, kept here while GameMate runs: closing the window to the tray
// frees its page, and a window opened again later picks up where the player left off. Nothing of
// this is written to disk.
import type { ChatMessage, MainWindowSession } from '../../shared/types'
import { withoutScreenshots } from '../../shared/chat'

const MAX_MESSAGES = 200

const empty = (): MainWindowSession => ({ featuresLater: false, messages: [] })
let session = empty()

export function getSession(): MainWindowSession {
  return session
}

// From the window's page, so only the known fields with the right types are kept.
export function updateSession(patch: unknown): void {
  if (typeof patch !== 'object' || patch === null) return
  const p = patch as Record<string, unknown>
  const next = { ...session }
  if (typeof p.featuresLater === 'boolean') next.featuresLater = p.featuresLater
  if (Array.isArray(p.messages)) {
    const messages = p.messages.filter(
      (m): m is ChatMessage =>
        typeof m === 'object' &&
        m !== null &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    next.messages = withoutScreenshots(messages.slice(-MAX_MESSAGES))
  }
  session = next
}

export function clearSession(): void {
  session = empty()
}
