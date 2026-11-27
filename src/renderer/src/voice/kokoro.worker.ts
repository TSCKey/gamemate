// Runs Kokoro, GameMate's natural voice in English, Spanish, French, Italian and Portuguese, off
// the UI thread on the CPU (WebAssembly), so the GPU stays free for the game. The model and
// voices come from GameMate's local model store; pronunciation is worked out here too.
import { env } from '@huggingface/transformers'
import { KokoroTTS } from 'kokoro-js'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import espeakWasmUrl from '../../../../vendor/espeak-ng/espeak-ng.wasm?url'
import type { LanguageCode } from '../../../shared/languages'
import { KOKORO_VOICE_FILES } from '../../../shared/voices'
import { kokoroInput, setESpeakWasm } from './kokoroText'
import { offlineRequest } from './offline'
import type { VoiceResponse } from './tts.worker'

const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const LOCAL = `gm-model://models/${REPO}/`

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = 'gm-model://models/'
// The files are already on disk; don't keep a second copy in the browser cache.
env.useBrowserCache = false
const onnx = env.backends.onnx
if (onnx.wasm) {
  // Load the runtime bundled with GameMate instead of from a CDN.
  onnx.wasm.wasmPaths = {
    wasm: new URL(ortWasmUrl, self.location.href).href,
    mjs: new URL(ortMjsUrl, self.location.href).href
  }
  // Several cores when the browser allows threads (GameMate turns them on).
  onnx.wasm.numThreads =
    typeof SharedArrayBuffer === 'undefined'
      ? 1
      : Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
}

// eSpeak's WebAssembly, bundled with GameMate, compiled once.
setESpeakWasm(() =>
  fetch(new URL(espeakWasmUrl, self.location.href).href)
    .then((r) => r.arrayBuffer())
    .then((bytes) => WebAssembly.compile(bytes))
)

// kokoro-js fetches its voices from Hugging Face; serve them from the local store instead, and
// never go online from here.
const realFetch = self.fetch.bind(self)
self.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const voice = /\/resolve\/[^/]+\/voices\/(\w+)\.bin$/.exec(url)
  if (voice && url.startsWith(`https://huggingface.co/${REPO}/`)) {
    return realFetch(`${LOCAL}voices/${voice[1]}.bin`)
  }
  if (offlineRequest(url, self.location.href) === 'refuse') {
    return Promise.reject(new Error('GameMate’s voice works offline.'))
  }
  return realFetch(input, init)
}
// kokoro-js would also keep each voice in the browser's cache storage; it's on disk already.
const noCache = { match: async () => undefined, put: async () => {} }
Object.defineProperty(self, 'caches', { value: { open: async () => noCache } })

export type KokoroRequest = {
  type: 'say'
  id: number
  text: string
  voice: string
  speed: number
  language: LanguageCode
}

let tts: Promise<KokoroTTS> | null = null

// Full precision on the CPU: measured faster than the 8-bit model and than WebGPU on integrated
// graphics (GameMate 0.1.3).
function load(): Promise<KokoroTTS> {
  tts ??= KokoroTTS.from_pretrained(REPO, { dtype: 'fp32', device: 'wasm' })
  tts.catch(() => (tts = null))
  return tts
}

async function synthesize(
  request: KokoroRequest
): Promise<{ samples: Float32Array; rate: number }> {
  // Only GameMate's own voice files, never a path from elsewhere.
  if (!KOKORO_VOICE_FILES.includes(request.voice)) throw new Error('Unknown Kokoro voice.')
  const model = await load()
  const voice = request.voice as 'af_heart'
  const speed = request.speed
  // kokoro-js pronounces English itself (with numbers, money and abbreviations spelled out);
  // the other languages go through eSpeak, then straight to the model with their own voice.
  // A piece with nothing to say ('!!!', '...') comes back silent, and the answer goes on.
  const input = await kokoroInput(request.text, request.language)
  if (!input) return { samples: new Float32Array(0), rate: 24000 }
  const audio =
    'text' in input
      ? await model.generate(input.text, { voice, speed })
      : await model.generate_from_ids(
          model.tokenizer(input.phonemes, { truncation: true }).input_ids,
          { voice, speed }
        )
  return { samples: audio.audio as Float32Array, rate: audio.sampling_rate }
}

self.onmessage = async (event: MessageEvent<KokoroRequest>) => {
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
