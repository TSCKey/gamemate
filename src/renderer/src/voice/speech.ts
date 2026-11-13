// Speech-to-text client: one shared Whisper worker per window, started when the player first
// speaks and closed again after a few quiet minutes (the model holds several hundred MB of memory).
import type { SpeechRequest, SpeechResponse } from './speech.worker'
import type { LanguageCode } from '../../../shared/languages'
import { whisperOptions } from '../../../shared/speech'
import { idleTimer } from '../../../shared/idle'

const IDLE_MS = 5 * 60_000

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>()

const idle = idleTimer(
  IDLE_MS,
  () => {
    worker?.terminate()
    worker = null
  },
  () => pending.size > 0
)

function getWorker(): Worker {
  idle.touch()
  if (!worker) {
    worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<SpeechResponse>) => {
      const message = event.data
      idle.touch()
      if (message.type === 'result') {
        pending.get(message.id)?.resolve(message.text)
        pending.delete(message.id)
      } else if (message.type === 'error' && message.id !== undefined) {
        pending.get(message.id)?.reject(new Error(message.message))
        pending.delete(message.id)
      }
    }
  }
  return worker
}

// Starts loading the model in the background, while the player is still speaking.
export function preloadSpeechModel(repo: string): void {
  getWorker().postMessage({ type: 'load', repo } satisfies SpeechRequest)
}

export function transcribe(
  repo: string,
  audio: Float32Array,
  language: LanguageCode
): Promise<string> {
  const w = getWorker()
  w.postMessage({ type: 'load', repo } satisfies SpeechRequest)
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage(
      {
        type: 'transcribe',
        id,
        audio,
        options: whisperOptions(repo, language)
      } satisfies SpeechRequest,
      [audio.buffer]
    )
  })
}
