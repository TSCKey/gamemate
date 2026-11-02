// Speech-to-text models: downloaded once on request into userData, then served to the
// renderer's speech worker over the gm-model:// protocol so recognition runs fully offline.
import { app, BrowserWindow, net, protocol } from 'electron'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, rename, rm, stat } from 'fs/promises'
import { dirname, join, normalize, relative } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { pathToFileURL } from 'url'
import type { SpeechModelId, ListenModelId, SpeechModelStatus } from '../shared/types'
export type { SpeechModelId, ListenModelId, SpeechModelStatus }

export const MODEL_SCHEME = 'gm-model'

const WHISPER_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'added_tokens.json',
  'special_tokens_map.json',
  'normalizer.json',
  'vocab.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
]

// Kokoro's American and British English voices.
export const KOKORO_VOICES = [
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_fenrir',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_alice',
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
  'bm_george',
  'bm_lewis'
]

// Speech recognition: Whisper (MIT), converted to ONNX by onnx-community, 8-bit quantized.
// Voice: Kokoro-82M (Apache 2.0). Pinned revisions so every install gets the same files.
export const SPEECH_MODELS = {
  fast: {
    kind: 'listen',
    repo: 'onnx-community/whisper-tiny.en',
    revision: '2575352d61be1bf7225cf8f8b268a4678025fc58',
    sizeMb: 45,
    files: WHISPER_FILES
  },
  accurate: {
    kind: 'listen',
    repo: 'onnx-community/whisper-base.en',
    revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe',
    sizeMb: 80,
    files: WHISPER_FILES
  },
  best: {
    kind: 'listen',
    repo: 'onnx-community/whisper-small.en',
    revision: '482fb8ba081b6e906f92efe103622316b2a0cc69',
    sizeMb: 250,
    files: WHISPER_FILES
  },
  kokoro: {
    kind: 'speak',
    repo: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
    sizeMb: 340,
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model.onnx',
      ...KOKORO_VOICES.map((v) => `voices/${v}.bin`)
    ]
  }
} as const satisfies Record<SpeechModelId, unknown>

const modelsDir = (): string => join(app.getPath('userData'), 'models')
const modelDir = (id: SpeechModelId): string => join(modelsDir(), SPEECH_MODELS[id].repo)
const downloads = new Map<SpeechModelId, { progress: number; error: string | null }>()

export function isSpeechModelId(value: unknown): value is SpeechModelId {
  return typeof value === 'string' && value in SPEECH_MODELS
}

export function isListenModelId(value: unknown): value is ListenModelId {
  return isSpeechModelId(value) && SPEECH_MODELS[value].kind === 'listen'
}

export function isSpeechModelInstalled(id: SpeechModelId): boolean {
  return status(id).installed
}

function status(id: SpeechModelId): SpeechModelStatus {
  const dl = downloads.get(id)
  return {
    id,
    kind: SPEECH_MODELS[id].kind,
    sizeMb: SPEECH_MODELS[id].sizeMb,
    installed: !dl && SPEECH_MODELS[id].files.every((f) => existsSync(join(modelDir(id), f))),
    progress: dl && !dl.error ? dl.progress : null,
    error: dl?.error ?? null
  }
}

export function speechModelStatuses(): SpeechModelStatus[] {
  return (Object.keys(SPEECH_MODELS) as SpeechModelId[]).map(status)
}

function broadcast(): void {
  const statuses = speechModelStatuses()
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('voice:models', statuses)
}

export async function downloadSpeechModel(id: SpeechModelId): Promise<void> {
  if (downloads.has(id) && !downloads.get(id)?.error) return
  const { repo, revision } = SPEECH_MODELS[id]
  const dir = modelDir(id)
  const tmp = `${dir}.partial`
  const state = { progress: 0, error: null as string | null }
  downloads.set(id, state)
  broadcast()

  try {
    await rm(tmp, { recursive: true, force: true })
    // Learn the total size first so progress is meaningful.
    const listing = await net.fetch(
      `https://huggingface.co/api/models/${repo}/tree/${revision}?recursive=true`
    )
    if (!listing.ok) throw new Error(`file list returned ${listing.status}`)
    const sizes = new Map(
      ((await listing.json()) as { path: string; size: number }[]).map((f) => [f.path, f.size])
    )
    const files: readonly string[] = SPEECH_MODELS[id].files
    const total = files.reduce<number>((sum, f) => sum + (sizes.get(f) ?? 0), 0)
    let received = 0
    let lastBroadcast = 0

    for (const name of files) {
      const res = await net.fetch(`https://huggingface.co/${repo}/resolve/${revision}/${name}`)
      if (!res.ok || !res.body) throw new Error(`${name} returned ${res.status}`)
      const file = join(tmp, name)
      await mkdir(dirname(file), { recursive: true })
      const body = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
      body.on('data', (chunk: Buffer) => {
        received += chunk.length
        state.progress = total ? received / total : 0
        if (Date.now() - lastBroadcast > 250) {
          lastBroadcast = Date.now()
          broadcast()
        }
      })
      await pipeline(body, createWriteStream(file))
      const expected = sizes.get(name)
      if (expected !== undefined && (await stat(file)).size !== expected) {
        throw new Error(`${name} is incomplete`)
      }
    }

    await rm(dir, { recursive: true, force: true })
    await mkdir(dirname(dir), { recursive: true })
    await rename(tmp, dir)
    downloads.delete(id)
  } catch (error) {
    state.error = `Could not download the ${SPEECH_MODELS[id].kind === 'speak' ? 'voice' : 'speech model'}: ${
      error instanceof Error ? error.message : String(error)
    }`
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
  broadcast()
}

export async function removeSpeechModel(id: SpeechModelId): Promise<void> {
  if (downloads.has(id) && !downloads.get(id)?.error) return
  downloads.delete(id)
  await rm(modelDir(id), { recursive: true, force: true })
  broadcast()
}

// Must run before the app is ready.
export function registerModelScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MODEL_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

// gm-model://models/<repo>/<file> -> <userData>/models/<repo>/<file>, never outside it.
export function serveModels(): void {
  // GameMate's pages load from file://, so to the browser these requests are cross-origin.
  const headers = { 'Access-Control-Allow-Origin': '*' }
  protocol.handle(MODEL_SCHEME, async (request) => {
    const url = new URL(request.url)
    const root = modelsDir()
    const file = normalize(join(root, decodeURIComponent(url.pathname)))
    const inside = relative(root, file)
    if (url.host !== 'models' || inside.startsWith('..') || inside === '') {
      return new Response('Not found', { status: 404, headers })
    }
    const info = await stat(file).catch(() => null)
    if (!info?.isFile()) return new Response('Not found', { status: 404, headers })
    const res = await net.fetch(pathToFileURL(file).toString())
    return new Response(res.body, {
      status: 200,
      headers: { ...headers, 'Content-Length': String(info.size) }
    })
  })
}
