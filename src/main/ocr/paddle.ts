// GameMate's kill-feed text reader: PaddleOCR in a background thread (paddle.worker.ts), started
// on the first read and stopped after a few idle minutes, when its files are deleted, and when
// GameMate quits.
import { app, type NativeImage } from 'electron'
import { createRequire } from 'module'
import { cpus } from 'os'
import { dirname, join } from 'path'
import type { Worker } from 'worker_threads'
import { isLocalModelInstalled, KILLFEED_OCR_ID, killfeedOcrFiles } from '../ai/localModels'
import type { OcrSegment } from './paddleOcr'
import type { PaddleRequest, PaddleSetup } from './paddle.worker'

const IDLE_MS = 5 * 60_000
// A read takes well under a second; this long means the thread is stuck.
const READ_TIMEOUT_MS = 15_000

let worker: Promise<Worker> | null = null
// The thread that started, so a crash of an older one is told apart.
let current: Worker | null = null
let nextId = 1
let idleTimer: NodeJS.Timeout | null = null
const waiting = new Map<number, (result: OcrSegment[] | Error) => void>()

export function paddleReady(): boolean {
  return isLocalModelInstalled(KILLFEED_OCR_ID)
}

// ONNX Runtime's WebAssembly engine: copied next to the app when it is packaged (see
// electron-builder.yml), straight from the package while developing.
function runtimeDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'ort')
  const require = createRequire(join(app.getAppPath(), 'package.json'))
  return dirname(require.resolve('onnxruntime-web'))
}

// A few threads make a read about twice as fast, without taking over a gaming PC's processor.
const threads = (): number => Math.max(1, Math.min(4, Math.floor(cpus().length / 4)))

function failAll(error: Error): void {
  for (const finish of waiting.values()) finish(error)
  waiting.clear()
}

// The thread's code is only loaded when the first read comes.
async function start(): Promise<Worker> {
  const setup: PaddleSetup = { ...killfeedOcrFiles(), runtime: runtimeDir(), threads: threads() }
  const { default: createPaddleWorker } = await import('./paddle.worker?nodeWorker')
  const started = createPaddleWorker({ workerData: setup })
  started.on('message', (reply: { id: number; segments?: OcrSegment[]; error?: string }) => {
    const finish = waiting.get(reply.id)
    if (!finish) return
    waiting.delete(reply.id)
    finish(reply.error !== undefined ? new Error(reply.error) : (reply.segments ?? []))
  })
  const forget = (): void => {
    if (current === started) {
      worker = null
      current = null
    }
  }
  started.on('error', (error) => {
    console.error('The kill-feed reader stopped:', error)
    forget()
    failAll(error)
  })
  started.on('exit', () => {
    forget()
    failAll(new Error('The kill-feed reader stopped'))
  })
  current = started
  console.info(`Kill-feed reader starting with ${setup.threads} thread(s)`)
  return started
}

// All the text in an image, with where it is.
export async function readWithPaddle(image: NativeImage): Promise<OcrSegment[]> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => void stopPaddle(), IDLE_MS)
  idleTimer.unref()
  const starting = (worker ??= start())
  starting.catch(() => {
    if (worker === starting) worker = null
  })
  const target = await starting
  const { width, height } = image.getSize()
  // Windows gives blue-green-red-alpha pixels, the order PaddleOCR's models expect.
  const bitmap = image.toBitmap()
  const data = bitmap.buffer.slice(bitmap.byteOffset, bitmap.byteOffset + bitmap.byteLength)
  const id = nextId++
  const request: PaddleRequest = { id, width, height, data: data as ArrayBuffer }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new Error('The kill-feed reader took too long'))
    }, READ_TIMEOUT_MS)
    waiting.set(id, (result) => {
      clearTimeout(timer)
      if (result instanceof Error) reject(result)
      else resolve(result)
    })
    target.postMessage(request, [request.data])
  })
}

export async function stopPaddle(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const running = worker
  worker = null
  current = null
  if (!running) return
  failAll(new Error('The kill-feed reader was stopped'))
  await (await running.catch(() => null))?.terminate()
  console.info('Kill-feed reader stopped')
}
