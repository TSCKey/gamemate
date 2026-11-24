// AI models that run on this PC through GameMate's built-in engine (llama.cpp). A small catalog
// of tested models, downloaded on request into userData; the first download also installs the
// engine. Every file is pinned to an exact version and checked against its SHA-256.
import { app, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, rename, rm, statfs } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { downloadVerified, partialPath, type DownloadSpec } from '../system/download'
import type { LocalModelStatus } from '../../shared/types'
import { t } from '../system/i18n'
import { getSettings, onSettingsChanged } from '../system/settings'
export type { LocalModelStatus }

// llama.cpp (MIT), Vulkan build for Windows: runs on NVIDIA, AMD and Intel graphics cards and
// falls back to the processor. Pinned to the build behind llama.cpp's v0.8.0 release.
const ENGINE = {
  build: 'b11960',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b11960/llama-b11960-bin-win-vulkan-x64.zip',
  size: 37345851,
  sha256: 'bac6914b5e83523eb008c6789eaa12669f93fbc196c3b9e8237b6672323b33e9'
}

interface ModelFile extends DownloadSpec {
  name: string
}

interface CatalogModel {
  id: string
  name: string
  label: string
  description: string
  // 'all': answers, screenshots and comments. 'commentary': only writes the companion's comments.
  // 'killfeed': reads shooters' kill feeds (text recognition, no AI engine needed).
  job: LocalModelStatus['job']
  // GGUF weights.
  model: ModelFile
  // The vision projector that lets the model read screenshots.
  mmproj?: ModelFile
  // Other files the model needs, such as a second network or its settings.
  extra?: ModelFile[]
  // GameMate's fine-tuning on top of the weights (a LoRA adapter), shipped with GameMate in
  // resources/commentary next to the model's license, so only the weights are downloaded.
  adapter?: BundledFile
}

interface BundledFile {
  name: string
  size: number
  sha256: string
}

const hf = (repo: string, revision: string, name: string): string =>
  `https://huggingface.co/${repo}/resolve/${revision}/${name}`

const qwen = (
  size: string,
  revision: string,
  model: [number, string],
  mmproj: [number, string]
): Pick<CatalogModel, 'job' | 'model' | 'mmproj'> => {
  const repo = `unsloth/Qwen3.5-${size}-GGUF`
  const modelName = `Qwen3.5-${size}-Q4_K_M.gguf`
  return {
    job: 'all',
    model: {
      name: modelName,
      url: hf(repo, revision, modelName),
      size: model[0],
      sha256: model[1]
    },
    mmproj: {
      name: 'mmproj-F16.gguf',
      url: hf(repo, revision, 'mmproj-F16.gguf'),
      size: mmproj[0],
      sha256: mmproj[1]
    }
  }
}

// Qwen3.5 (Apache 2.0) in 4-bit GGUF by Unsloth. All of them can see screenshots.
export const LOCAL_MODELS: CatalogModel[] = [
  {
    id: 'qwen3.5-2b',
    name: 'Qwen3.5 2B',
    get label(): string {
      return t('models.local.fast')
    },
    get description(): string {
      return t('models.local.2b')
    },
    ...qwen(
      '2B',
      'f6d5376be1edb4d416d56da11e5397a961aca8ae',
      [1280835840, 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223'],
      [668227264, '7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7']
    )
  },
  {
    id: 'qwen3.5-4b',
    name: 'Qwen3.5 4B',
    get label(): string {
      return t('models.local.smart')
    },
    get description(): string {
      return t('models.local.4b')
    },
    ...qwen(
      '4B',
      'e87f176479d0855a907a41277aca2f8ee7a09523',
      [2740937888, '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4'],
      [672423616, 'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864']
    )
  },
  {
    id: 'qwen3.5-9b',
    name: 'Qwen3.5 9B',
    get label(): string {
      return t('models.local.best')
    },
    get description(): string {
      return t('models.local.9b')
    },
    ...qwen(
      '9B',
      '3885219b6810b007914f3a7950a8d1b469d598a5',
      [5680522464, '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'],
      [918166080, 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f']
    )
  }
]

// The comment writer: Liquid AI's LFM2.5 1.2B (LFM Open License 1.0, in resources/commentary)
// with GameMate's own fine-tuning, trained on hand-written comments for game moments. It writes a comment in about
// a quarter of a second and needs about 1 GB of memory, so it can stay loaded while GameMate
// watches. Text only, and trained in English: other languages keep using the main model.
export const COMMENTARY_MODEL_ID = 'lfm2.5-1.2b-commentary'
const LFM = {
  repo: 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF',
  revision: '8ed288026e23958ad9dfa92d53ed773a8eee7125'
}
const COMMENTARY_ADAPTER_VERSION = 2
export const COMMENTARY_MODEL: CatalogModel = {
  id: COMMENTARY_MODEL_ID,
  name: 'LFM2.5 1.2B',
  get label(): string {
    return t('models.local.commentary')
  },
  get description(): string {
    return t('models.local.commentaryHelp')
  },
  job: 'commentary',
  model: {
    name: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
    url: hf(LFM.repo, LFM.revision, 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf'),
    size: 730895168,
    sha256: 'b1b3de114215d9507409a662a501a631095a479a419584e8a2ded6304b19b4f5'
  },
  adapter: {
    name: `gamemate-commentary-v${COMMENTARY_ADAPTER_VERSION}.gguf`,
    size: 22230048,
    sha256: 'edca8d1b6d485af590b91620d4b3788eddbe47b8fb3dd2d1261d180528cbfe31'
  }
}

// The kill-feed reader: PaddleOCR's PP-OCRv6 small text detection and recognition (Apache 2.0),
// PaddlePaddle's own ONNX files, run on the processor by GameMate's text reader (src/main/ocr).
export const KILLFEED_OCR_ID = 'pp-ocrv6-small'
const PADDLE = {
  detect: {
    repo: 'PaddlePaddle/PP-OCRv6_small_det_onnx',
    revision: '28fe5895c24fd108c19eb3e8479f4ab385fbfc62'
  },
  recognize: {
    repo: 'PaddlePaddle/PP-OCRv6_small_rec_onnx',
    revision: 'b8f84f0b80c529de40b4fbb3544b84fa7233a513'
  }
}
export const KILLFEED_OCR: CatalogModel = {
  id: KILLFEED_OCR_ID,
  name: 'PP-OCRv6',
  get label(): string {
    return t('models.local.killfeed')
  },
  get description(): string {
    return t('models.local.killfeedHelp')
  },
  job: 'killfeed',
  model: {
    name: 'detect.onnx',
    url: hf(PADDLE.detect.repo, PADDLE.detect.revision, 'inference.onnx'),
    size: 9880512,
    sha256: 'd73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e'
  },
  extra: [
    {
      name: 'recognize.onnx',
      url: hf(PADDLE.recognize.repo, PADDLE.recognize.revision, 'inference.onnx'),
      size: 21159378,
      sha256: '5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634'
    },
    {
      // The recognition model's settings, with its list of characters.
      name: 'recognize.yml',
      url: hf(PADDLE.recognize.repo, PADDLE.recognize.revision, 'inference.yml'),
      size: 150579,
      sha256: 'ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1'
    }
  ]
}

const CATALOG: CatalogModel[] = [...LOCAL_MODELS, COMMENTARY_MODEL, KILLFEED_OCR]

// Text recognition runs without the AI engine.
const needsEngine = (model: CatalogModel): boolean => model.job !== 'killfeed'

const engineRoot = (): string => join(app.getPath('userData'), 'engine')
export const engineDir = (): string => join(engineRoot(), ENGINE.build)
export const engineExe = (): string => join(engineDir(), 'llama-server.exe')
const modelsRoot = (): string => join(app.getPath('userData'), 'llm')
const modelDir = (id: string): string => join(modelsRoot(), id)
// Files shipped with GameMate. electron-builder unpacks resources/ from the app archive, so the
// engine (a separate program) can read them from disk.
export const unpacked = (path: string): string =>
  path.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked')
export const bundledDir = (): string => unpacked(join(app.getAppPath(), 'resources', 'commentary'))

const downloads = new Map<
  string,
  { progress: number; error: string | null; controller: AbortController }
>()

function find(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id)
}

// A model that can be GameMate's main model (answers, screenshots and comments).
export function isLocalModelId(value: unknown): value is string {
  return typeof value === 'string' && find(value)?.job === 'all'
}

// Any model in the catalog, the comment writer included (downloads and deletes).
export function isCatalogModelId(value: unknown): value is string {
  return typeof value === 'string' && find(value) !== undefined
}

// The files to download.
const filesOf = (model: CatalogModel): ModelFile[] =>
  [model.model, model.mmproj, ...(model.extra ?? [])].filter((f): f is ModelFile => f !== undefined)

const engineInstalled = (): boolean => existsSync(engineExe())

function filesInstalled(model: CatalogModel): boolean {
  return (
    filesOf(model).every((f) => existsSync(join(modelDir(model.id), f.name))) &&
    (!model.adapter || existsSync(join(bundledDir(), model.adapter.name)))
  )
}

export function isLocalModelInstalled(id: string): boolean {
  const model = find(id)
  const busy = downloads.has(id) && !downloads.get(id)?.error
  return !!model && !busy && (!needsEngine(model) || engineInstalled()) && filesInstalled(model)
}

export interface ModelPaths {
  model: string
  mmproj?: string
  adapter?: string
}

// Paths the engine needs to run a model; throws when it isn't downloaded.
export function localModelFiles(id: string): ModelPaths {
  const model = find(id)
  if (!model || !isLocalModelInstalled(id)) {
    throw new Error(t('errors.ai.noLocalModel'))
  }
  return {
    model: join(modelDir(id), model.model.name),
    ...(model.mmproj ? { mmproj: join(modelDir(id), model.mmproj.name) } : {}),
    ...(model.adapter ? { adapter: join(bundledDir(), model.adapter.name) } : {})
  }
}

// The kill-feed reader's files, by what they are; throws when they aren't downloaded.
export function killfeedOcrFiles(): { detect: string; recognize: string; characters: string } {
  if (!isLocalModelInstalled(KILLFEED_OCR_ID)) throw new Error(t('errors.ai.noLocalModel'))
  const file = (name: string): string => join(modelDir(KILLFEED_OCR_ID), name)
  return {
    detect: file('detect.onnx'),
    recognize: file('recognize.onnx'),
    characters: file('recognize.yml')
  }
}

function status(model: CatalogModel): LocalModelStatus {
  const dl = downloads.get(model.id)
  return {
    id: model.id,
    name: model.name,
    label: model.label,
    description: model.description,
    job: model.job,
    sizeMb: Math.round(filesOf(model).reduce((sum, f) => sum + f.size, 0) / 1_000_000),
    installed: isLocalModelInstalled(model.id),
    progress: dl && !dl.error ? dl.progress : null,
    error: dl?.error ?? null
  }
}

export function localModelStatuses(): LocalModelStatus[] {
  return CATALOG.map(status)
}

function broadcast(): void {
  const statuses = localModelStatuses()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('local-models:changed', statuses)
  }
}

// The models' labels are in the player's language: send them again when it changes. Called at
// startup (settings.ts imports this file, so it can't register itself while loading).
export function followLanguage(): void {
  let shown = getSettings().language
  onSettingsChanged((settings) => {
    if (settings.language === shown) return
    shown = settings.language
    broadcast()
  })
}

// Windows 10 and 11 include bsdtar, which can unpack zip files.
async function unzip(zip: string, dir: string): Promise<void> {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  // Only the server, its libraries and license files are needed.
  await promisify(execFile)(tar, ['-xf', zip, '-C', dir, 'llama-server.exe', '*.dll', 'LICENSE*'])
}

// Shared, so two model downloads started together don't both install the engine.
let engineInstall: Promise<void> | null = null

function ensureEngine(onBytes: (delta: number) => void, signal: AbortSignal): Promise<void> {
  engineInstall ??= installEngine(onBytes, signal).finally(() => (engineInstall = null))
  return engineInstall
}

async function installEngine(onBytes: (delta: number) => void, signal: AbortSignal): Promise<void> {
  const zip = join(engineRoot(), `${ENGINE.build}.zip`)
  await downloadVerified(ENGINE, zip, onBytes, signal)
  const tmp = `${engineDir()}.partial`
  await rm(tmp, { recursive: true, force: true })
  await mkdir(tmp, { recursive: true })
  await unzip(zip, tmp)
  if (!existsSync(join(tmp, 'llama-server.exe')))
    throw new Error(t('errors.download.engineIncomplete'))
  await rm(engineDir(), { recursive: true, force: true })
  await rename(tmp, engineDir())
  await rm(zip, { force: true })
}

async function ensureDiskSpace(bytes: number): Promise<void> {
  await mkdir(modelsRoot(), { recursive: true })
  const { bavail, bsize } = await statfs(modelsRoot())
  // Leave some room for the engine files and the rest of Windows.
  const needed = bytes + 500_000_000
  if (bavail * bsize < needed) {
    throw new Error(t('errors.download.diskSpace', { size: (needed / 1e9).toFixed(1) }))
  }
}

// Downloads a model (and the engine, the first time). Progress and errors are broadcast to
// every window; resolves when finished, failed or cancelled.
export async function downloadLocalModel(id: string): Promise<boolean> {
  const model = find(id)
  if (!model || (downloads.has(id) && !downloads.get(id)?.error)) return false
  const controller = new AbortController()
  const state = { progress: 0, error: null as string | null, controller }
  downloads.set(id, state)
  broadcast()

  try {
    const missing = filesOf(model).filter((f) => !existsSync(join(modelDir(id), f.name)))
    const needEngine = needsEngine(model) && !engineInstalled()
    const total = (needEngine ? ENGINE.size : 0) + missing.reduce((sum, f) => sum + f.size, 0) || 1
    await ensureDiskSpace(total)

    let received = 0
    let lastBroadcast = 0
    const onBytes = (delta: number): void => {
      received += delta
      state.progress = Math.min(1, received / total)
      if (Date.now() - lastBroadcast > 250) {
        lastBroadcast = Date.now()
        broadcast()
      }
    }
    if (needEngine) await ensureEngine(onBytes, controller.signal)
    for (const file of missing) {
      await downloadVerified(file, join(modelDir(id), file.name), onBytes, controller.signal)
    }
    downloads.delete(id)
    broadcast()
    return true
  } catch (error) {
    if (controller.signal.aborted) {
      downloads.delete(id)
    } else {
      // Partial files stay, so trying again continues where this stopped.
      state.error = t('errors.download.failed', {
        name: model.name,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
    broadcast()
    return false
  }
}

// Stops a download and throws away what was downloaded so far.
export async function cancelLocalModel(id: string): Promise<void> {
  const model = find(id)
  const dl = downloads.get(id)
  if (!model || !dl) return
  dl.controller.abort()
  downloads.delete(id)
  await Promise.all(
    filesOf(model).map((f) => rm(partialPath(join(modelDir(id), f.name)), { force: true }))
  )
  broadcast()
}

export async function removeLocalModel(id: string): Promise<void> {
  if (!find(id)) return
  await cancelLocalModel(id)
  downloads.delete(id)
  await rm(modelDir(id), { recursive: true, force: true })
  broadcast()
}

// "Delete my data": every model and the engine.
export async function removeAllLocalModels(): Promise<void> {
  for (const model of CATALOG) await cancelLocalModel(model.id)
  downloads.clear()
  await rm(modelsRoot(), { recursive: true, force: true })
  await rm(engineRoot(), { recursive: true, force: true })
  broadcast()
}
