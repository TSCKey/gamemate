// GameMate's natural voice (Supertonic), played in the pop-up window: text is spoken sentence
// by sentence, so the first words start quickly even for long answers.
import type { SayRequest } from '../../../preload/index.d'
import type { VoiceRequest, VoiceResponse } from './tts.worker'
import { splitForSpeech } from './supertonicText'

let worker: Worker | null = null
let nextId = 1
let generation = 0
let context: AudioContext | null = null
let playing: AudioBufferSourceNode | null = null
const pending = new Map<number, (r: VoiceResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<VoiceResponse>) => {
      pending.get(event.data.id)?.(event.data)
      pending.delete(event.data.id)
    }
  }
  return worker
}

function synthesize(text: string, request: SayRequest): Promise<VoiceResponse> {
  const id = nextId++
  const { voice, speed, language } = request
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({
      type: 'say',
      id,
      text,
      voice,
      speed,
      language
    } satisfies VoiceRequest)
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
  const parts = splitForSpeech(request.text, request.language)
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
    await play(result.samples, result.rate, request.volume)
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
