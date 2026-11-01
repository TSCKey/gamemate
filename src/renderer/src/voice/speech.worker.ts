// Runs Whisper speech recognition off the UI thread, on the CPU (WebAssembly) so the GPU
// stays free for the game. Models come from GameMate's local model store, never the internet.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'

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

export type SpeechRequest =
  { type: 'load'; repo: string } | { type: 'transcribe'; id: number; audio: Float32Array }

export type SpeechResponse =
  | { type: 'loaded'; repo: string }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string }

let recognizer: Promise<AutomaticSpeechRecognitionPipeline> | null = null
let loadedRepo = ''

function load(repo: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!recognizer || loadedRepo !== repo) {
    loadedRepo = repo
    recognizer = pipeline('automatic-speech-recognition', repo, {
      device: 'wasm',
      dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' }
    }) as Promise<AutomaticSpeechRecognitionPipeline>
    recognizer.catch(() => (recognizer = null))
  }
  return recognizer
}

const post = (message: SpeechResponse): void => self.postMessage(message)

self.onmessage = async (event: MessageEvent<SpeechRequest>) => {
  const request = event.data
  try {
    if (request.type === 'load') {
      await load(request.repo)
      post({ type: 'loaded', repo: request.repo })
    } else {
      const recognize = await load(loadedRepo)
      const output = await recognize(request.audio)
      const text = (Array.isArray(output) ? output[0] : output).text
      post({ type: 'result', id: request.id, text: text.trim() })
    }
  } catch (error) {
    post({
      type: 'error',
      id: request.type === 'transcribe' ? request.id : undefined,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
