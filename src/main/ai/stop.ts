// Stopping an answer: the player pressed ■ while GameMate was thinking or writing. The AI's
// request is closed (which frees the built-in AI and the graphics card) and nothing more is
// asked, not even the other AI in Auto mode.
import { t } from '../system/i18n'

// Not an UnreachableError: a stopped answer must not be retried with the other AI.
export class StoppedError extends Error {
  constructor() {
    super(t('errors.answerStopped'))
  }
}

// Questions still being answered, by window and request ("<window id>:<request id>").
const running = new Map<string, AbortController>()

export function startAnswer(key: string): AbortSignal {
  const controller = new AbortController()
  running.set(key, controller)
  return controller.signal
}

export function stopAnswer(key: string): void {
  running.get(key)?.abort(new StoppedError())
}

export function endAnswer(key: string): void {
  running.delete(key)
}

export function throwIfStopped(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason
}

// A request's signal: its time limit, and the player's stop when there is one.
export function requestSignal(timeoutMs: number, stop?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return stop ? AbortSignal.any([timeout, stop]) : timeout
}
