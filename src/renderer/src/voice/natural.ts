// GameMate's natural voices (Kokoro and Supertonic), played in the pop-up window: text is spoken
// sentence by sentence, so the first words start quickly even for long answers. Each voice runs
// in its own worker; only the one in use is kept, and both go when the pop-up window closes
// after a few quiet minutes.
import type { SayRequest } from '../../../preload/index.d'
import type { VoiceRequest, VoiceResponse } from './tts.worker'
import type { KokoroRequest } from './kokoro.worker'
import { splitForSpeech } from './supertonicText'

type Engine = SayRequest['engine']

const workers = new Map<Engine, Worker>()
let nextId = 1
let generation = 0
let context: AudioContext | null = null
let playing: AudioBufferSourceNode | null = null
const pending = new Map<number, (r: VoiceResponse) => void>()

function getWorker(engine: Engine): Worker {
  // The other voice's model isn't needed any more (hundreds of MB). Its unfinished sentences
  // (all of them: one voice speaks at a time) are dropped.
  for (const [other, worker] of workers) {
    if (other === engine) continue
    worker.terminate()
    workers.delete(other)
    for (const [id, resolve] of pending) resolve({ type: 'error', id, message: 'stopped' })
    pending.clear()
  }
  let worker = workers.get(engine)
  if (!worker) {
    worker =
      engine === 'kokoro'
        ? new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<VoiceResponse>) => {
      pending.get(event.data.id)?.(event.data)
      pending.delete(event.data.id)
    }
    workers.set(engine, worker)
  }
  return worker
}

function synthesize(text: string, request: SayRequest): Promise<VoiceResponse> {
  const id = nextId++
  const { speed, language } = request
  const worker = getWorker(request.engine)
  return new Promise((resolve) => {
    pending.set(id, resolve)
    if (request.engine === 'kokoro') {
      const message: KokoroRequest = {
        type: 'say',
        id,
        text,
        voice: request.voice,
        speed,
        language
      }
      worker.postMessage(message)
    } else {
      const message: VoiceRequest = { type: 'say', id, text, voice: request.voice, speed, language }
      worker.postMessage(message)
    }
  })
}

function play(samples: Float32Array, rate: number, volume: number): Promise<void> {
  context ??= new AudioContext()
  const buffer = context.createBuffer(1, samples.length, rate)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const source = context.createBufferSource()
  const gain = context.createGain()
  gain.gain.value = volume
  source.buffer = buffer
  source.connect(gain).connect(context.destination)
  playing = source
  return new Promise((resolve) => {
    source.onended = () => resolve()
    source.start()
  })
}

export async function say(request: SayRequest): Promise<void> {
  hush()
  const mine = ++generation
  const parts = splitForSpeech(request.text)
  if (!parts.length) return
  // Start making the next sentence while the current one plays.
  let next = synthesize(parts[0], request)
  for (let i = 0; i < parts.length; i++) {
    const result = await next
    if (mine !== generation) return
    if (i + 1 < parts.length) next = synthesize(parts[i + 1], request)
    if (result.type === 'error') {
      console.error('Natural voice failed', result.message)
      return
    }
    // A piece with nothing to say comes back without sound.
    if (result.samples.length) await play(result.samples, result.rate, request.volume)
    if (mine !== generation) return
  }
}

export function hush(): void {
  generation++
  try {
    playing?.stop()
  } catch {
    // already stopped
  }
  playing = null
}
