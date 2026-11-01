// Runs Kokoro, GameMate's natural voice, off the UI thread on the CPU (WebAssembly), so the GPU
// stays free for the game. The model and voices come from GameMate's local model store.
import { env } from '@huggingface/transformers'
import { KokoroTTS } from 'kokoro-js'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'

const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const LOCAL = `gm-model://models/${REPO}/`

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = 'gm-model://models/'
env.useBrowserCache = false
const onnx = env.backends.onnx
if (onnx.wasm) {
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

// kokoro-js fetches voices from Hugging Face; serve them from the local store instead, and
// never go online from here.
const realFetch = self.fetch.bind(self)
self.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const voice = /\/resolve\/[^/]+\/(voices\/\w+\.bin)$/.exec(url)
  if (voice && url.startsWith(`https://huggingface.co/${REPO}/`)) {
    return realFetch(`${LOCAL}${voice[1]}`)
  }
  if (/^https?:/i.test(url)) return Promise.reject(new Error('GameMate’s voice works offline.'))
  return realFetch(input, init)
}

export type VoiceRequest = { type: 'say'; id: number; text: string; voice: string; speed: number }

export type VoiceResponse =
  | { type: 'audio'; id: number; samples: Float32Array; rate: number }
  | { type: 'error'; id: number; message: string }

let tts: Promise<KokoroTTS> | null = null

// Full precision on the CPU measured fastest: about real time with 4 threads, twice as fast as
// the 8-bit model and faster than WebGPU on integrated graphics.
function load(): Promise<KokoroTTS> {
  tts ??= KokoroTTS.from_pretrained(REPO, { dtype: 'fp32', device: 'wasm' })
  tts.catch(() => (tts = null))
  return tts
}

self.onmessage = async (event: MessageEvent<VoiceRequest>) => {
  const { id, text, voice, speed } = event.data
  try {
    const model = await load()
    // The main process only sends voice ids from GameMate's list.
    const audio = await model.generate(text, { voice: voice as 'af_heart', speed })
    const samples = audio.audio as Float32Array
    self.postMessage(
      { type: 'audio', id, samples, rate: audio.sampling_rate } satisfies VoiceResponse,
      {
        transfer: [samples.buffer]
      }
    )
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error)
    } satisfies VoiceResponse)
  }
}
