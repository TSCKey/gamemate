// Reads text with PaddleOCR off GameMate's main thread: a look takes about half a second of
// processor time, which would otherwise hold up every window. Started by paddle.ts.
import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { parentPort, workerData } from 'worker_threads'
import * as ort from 'onnxruntime-web'
import {
  ctcTable,
  DETECT_FOR,
  readImage,
  yamlCharacters,
  type OcrModel,
  type TextKind
} from './paddleOcr'

export interface PaddleSetup {
  detect: string
  recognize: string
  characters: string
  // The folder with ONNX Runtime's WebAssembly engine (ort-wasm-simd-threaded.mjs and .wasm).
  runtime: string
  threads: number
}

export interface PaddleRequest {
  id: number
  width: number
  height: number
  data: ArrayBuffer
  // What kind of text it is, which sets how much the image is scaled before reading.
  kind: TextKind
}

const setup = workerData as PaddleSetup
ort.env.wasm.wasmPaths = pathToFileURL(`${setup.runtime}/`).href
ort.env.wasm.numThreads = setup.threads

async function load(path: string): Promise<OcrModel> {
  const session = await ort.InferenceSession.create(readFileSync(path))
  const input = session.inputNames[0]
  const output = session.outputNames[0]
  return {
    run: async (data, dims) => {
      const result = await session.run({ [input]: new ort.Tensor('float32', data, dims) })
      const tensor = result[output]
      return { data: tensor.data as Float32Array, dims: tensor.dims }
    }
  }
}

const models = Promise.all([load(setup.detect), load(setup.recognize)]).then(
  ([detect, recognize]) => ({
    detect,
    recognize,
    table: ctcTable(yamlCharacters(readFileSync(setup.characters, 'utf8')))
  })
)
// Reported with the first request instead, so a failed start doesn't end the thread unseen.
models.catch(() => undefined)

parentPort?.on('message', async (request: PaddleRequest) => {
  try {
    const image = {
      width: request.width,
      height: request.height,
      data: new Uint8Array(request.data)
    }
    const segments = await readImage(image, await models, DETECT_FOR[request.kind])
    parentPort?.postMessage({ id: request.id, segments })
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})
