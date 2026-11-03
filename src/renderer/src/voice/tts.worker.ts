// Runs Supertonic, GameMate's natural voice, off the UI thread on the CPU (WebAssembly), so the
// GPU stays free for the game. The model and voices come from GameMate's local model store.
// The steps (duration, text encoder, denoising, vocoder) follow Supertone's MIT-licensed sample
// code (github.com/supertone-oss-archive/supertonic, web/helper.js).
import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import type { LanguageCode } from '../../../shared/languages'
import type { SupertonicVoice } from '../../../shared/types'
import { prepareText, textToIds } from './supertonicText'

const ROOT = 'gm-model://models/Supertone/supertonic-3/'
// Denoising steps: Supertone's default; at 8 steps it speaks about 1.7x faster than real time
// on 4 threads.
const STEPS = 8
// Supertone's default pace, multiplied by the player's speed setting.
const BASE_SPEED = 1.05

ort.env.wasm.wasmPaths = {
  wasm: new URL(ortWasmUrl, self.location.href).href,
  mjs: new URL(ortMjsUrl, self.location.href).href
}
// Several cores when the browser allows threads (GameMate turns them on).
ort.env.wasm.numThreads =
  typeof SharedArrayBuffer === 'undefined'
    ? 1
    : Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)))

// Never go online from here: everything comes from the local model store.
const realFetch = self.fetch.bind(self)
self.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (/^https?:/i.test(url)) return Promise.reject(new Error('GameMate’s voice works offline.'))
  return realFetch(input, init)
}

export type VoiceRequest = {
  type: 'say'
  id: number
  text: string
  voice: SupertonicVoice
  speed: number
  language: LanguageCode
}

export type VoiceResponse =
  | { type: 'audio'; id: number; samples: Float32Array; rate: number }
  | { type: 'error'; id: number; message: string }

interface Config {
  ae: { sample_rate: number; base_chunk_size: number }
  ttl: { latent_dim: number; chunk_compress_factor: number }
}

interface Model {
  config: Config
  indexer: number[]
  duration: ort.InferenceSession
  encoder: ort.InferenceSession
  estimator: ort.InferenceSession
  vocoder: ort.InferenceSession
}

interface Style {
  ttl: ort.Tensor
  dp: ort.Tensor
}

const json = <T>(file: string): Promise<T> => fetch(ROOT + file).then((r) => r.json() as T)

let model: Promise<Model> | null = null
function load(): Promise<Model> {
  model ??= (async () => {
    const session = (name: string): Promise<ort.InferenceSession> =>
      ort.InferenceSession.create(`${ROOT}onnx/${name}.onnx`, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      })
    const [config, indexer] = await Promise.all([
      json<Config>('onnx/tts.json'),
      json<number[]>('onnx/unicode_indexer.json')
    ])
    return {
      config,
      indexer,
      duration: await session('duration_predictor'),
      encoder: await session('text_encoder'),
      estimator: await session('vector_estimator'),
      vocoder: await session('vocoder')
    }
  })()
  model.catch(() => (model = null))
  return model
}

type StyleFile = Record<'style_ttl' | 'style_dp', { data: unknown[]; dims: number[] }>
const styles = new Map<SupertonicVoice, Promise<Style>>()
function style(voice: SupertonicVoice): Promise<Style> {
  let found = styles.get(voice)
  if (!found) {
    const tensor = ({ data, dims }: StyleFile['style_ttl']): ort.Tensor =>
      new ort.Tensor('float32', Float32Array.from(data.flat(Infinity) as number[]), dims)
    found = json<StyleFile>(`voice_styles/${voice}.json`).then((f) => ({
      ttl: tensor(f.style_ttl),
      dp: tensor(f.style_dp)
    }))
    found.catch(() => styles.delete(voice))
    styles.set(voice, found)
  }
  return found
}

// Standard normal noise (Box-Muller), the starting point the model denoises into speech.
function noise(length: number): Float32Array {
  const values = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const u = Math.max(0.0001, Math.random())
    values[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random())
  }
  return values
}

async function synthesize(request: VoiceRequest): Promise<{ samples: Float32Array; rate: number }> {
  const m = await load()
  const voice = await style(request.voice)
  const ids = textToIds(prepareText(request.text, request.language), m.indexer)
  const n = ids.length
  const textIds = new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, n])
  const textMask = new ort.Tensor('float32', new Float32Array(n).fill(1), [1, 1, n])

  const { duration } = await m.duration.run({
    text_ids: textIds,
    style_dp: voice.dp,
    text_mask: textMask
  })
  const seconds = (duration.data as Float32Array)[0] / (BASE_SPEED * request.speed)
  const { text_emb } = await m.encoder.run({
    text_ids: textIds,
    style_ttl: voice.ttl,
    text_mask: textMask
  })

  const rate = m.config.ae.sample_rate
  const chunk = m.config.ae.base_chunk_size * m.config.ttl.chunk_compress_factor
  const length = Math.ceil(Math.floor(seconds * rate) / chunk)
  const dims = [1, m.config.ttl.latent_dim * m.config.ttl.chunk_compress_factor, length]
  let latent = noise(dims[1] * length)
  const latentMask = new ort.Tensor('float32', new Float32Array(length).fill(1), [1, 1, length])
  const totalStep = new ort.Tensor('float32', new Float32Array([STEPS]), [1])
  for (let step = 0; step < STEPS; step++) {
    const { denoised_latent } = await m.estimator.run({
      noisy_latent: new ort.Tensor('float32', latent, dims),
      text_emb,
      style_ttl: voice.ttl,
      latent_mask: latentMask,
      text_mask: textMask,
      current_step: new ort.Tensor('float32', new Float32Array([step]), [1]),
      total_step: totalStep
    })
    latent = denoised_latent.data as Float32Array
  }
  const { wav_tts } = await m.vocoder.run({ latent: new ort.Tensor('float32', latent, dims) })
  // The vocoder fills whole chunks; keep only the predicted length.
  const samples = (wav_tts.data as Float32Array).slice(0, Math.floor(seconds * rate))
  return { samples, rate }
}

self.onmessage = async (event: MessageEvent<VoiceRequest>) => {
  const { id } = event.data
  try {
    const { samples, rate } = await synthesize(event.data)
    self.postMessage({ type: 'audio', id, samples, rate } satisfies VoiceResponse, {
      transfer: [samples.buffer]
    })
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error)
    } satisfies VoiceResponse)
  }
}
