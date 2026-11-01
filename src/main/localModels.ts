// AI models that run on this PC through GameMate's built-in engine (llama.cpp). A small catalog
// of tested models, downloaded on request into userData; the first download also installs the
// engine. Every file is pinned to an exact version and checked against its SHA-256.
import { app, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, rename, rm, statfs } from 'fs/promises'
import { join } from 'path'
import { promisify } from 'util'
import { downloadVerified, partialPath, type DownloadSpec } from './download'

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
  // GGUF weights, then the vision projector that lets the model read screenshots.
  model: ModelFile
  mmproj: ModelFile
}

const hf = (repo: string, revision: string, name: string): string =>
  `https://huggingface.co/${repo}/resolve/${revision}/${name}`

const qwen = (
  size: string,
  revision: string,
  model: [number, string],
  mmproj: [number, string]
): Pick<CatalogModel, 'model' | 'mmproj'> => {
  const repo = `unsloth/Qwen3.5-${size}-GGUF`
  const modelName = `Qwen3.5-${size}-Q4_K_M.gguf`
  return {
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
    label: 'Fast',
    description: 'Quick answers on most graphics cards. A good start.',
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
    label: 'Smart',
    description: 'Better answers. Best with 6 GB or more of graphics memory.',
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
    label: 'Best',
    description: 'The best answers on this PC. Best with 10 GB or more of graphics memory.',
    ...qwen(
      '9B',
      '3885219b6810b007914f3a7950a8d1b469d598a5',
      [5680522464, '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8'],
      [918166080, 'f70dc3509053962b0d0d3ee8a7eacebf5d60aa560cad78254ae8698516ae029f']
    )
  }
]

export interface LocalModelStatus {
  id: string
  name: string
  label: string
  description: string
  sizeMb: number
  installed: boolean
  // 0-1 while downloading, otherwise null.
  progress: number | null
  error: string | null
}

const engineRoot = (): string => join(app.getPath('userData'), 'engine')
export const engineDir = (): string => join(engineRoot(), ENGINE.build)
export const engineExe = (): string => join(engineDir(), 'llama-server.exe')
const modelsRoot = (): string => join(app.getPath('userData'), 'llm')
const modelDir = (id: string): string => join(modelsRoot(), id)

const downloads = new Map<
  string,
  { progress: number; error: string | null; controller: AbortController }
>()

function find(id: string): CatalogModel | undefined {
  return LOCAL_MODELS.find((m) => m.id === id)
}

export function isLocalModelId(value: unknown): value is string {
  return typeof value === 'string' && find(value) !== undefined
}

const engineInstalled = (): boolean => existsSync(engineExe())

function filesInstalled(model: CatalogModel): boolean {
  return [model.model, model.mmproj].every((f) => existsSync(join(modelDir(model.id), f.name)))
}

export function isLocalModelInstalled(id: string): boolean {
  const model = find(id)
  const busy = downloads.has(id) && !downloads.get(id)?.error
  return !!model && !busy && engineInstalled() && filesInstalled(model)
}

// Paths the engine needs to run a model; throws when it isn't downloaded.
export function localModelFiles(id: string): { model: string; mmproj: string } {
  const model = find(id)
  if (!model || !isLocalModelInstalled(id)) {
    throw new Error('Download an AI model in GameMate first (Settings → Models).')
  }
  return {
    model: join(modelDir(id), model.model.name),
    mmproj: join(modelDir(id), model.mmproj.name)
  }
}

function status(model: CatalogModel): LocalModelStatus {
  const dl = downloads.get(model.id)
  return {
    id: model.id,
    name: model.name,
    label: model.label,
    description: model.description,
    sizeMb: Math.round((model.model.size + model.mmproj.size) / 1_000_000),
    installed: isLocalModelInstalled(model.id),
    progress: dl && !dl.error ? dl.progress : null,
    error: dl?.error ?? null
  }
}

export function localModelStatuses(): LocalModelStatus[] {
  return LOCAL_MODELS.map(status)
}

function broadcast(): void {
  const statuses = localModelStatuses()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('local-models:changed', statuses)
  }
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
  if (!existsSync(join(tmp, 'llama-server.exe'))) throw new Error('the AI engine is incomplete')
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
    throw new Error(`there isn't enough free disk space (needs ${(needed / 1e9).toFixed(1)} GB)`)
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
    const missing = [model.model, model.mmproj].filter(
      (f) => !existsSync(join(modelDir(id), f.name))
    )
    const needEngine = !engineInstalled()
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
      state.error = `Could not download ${model.name}: ${
        error instanceof Error ? error.message : String(error)
      }`
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
    [model.model, model.mmproj].map((f) =>
      rm(partialPath(join(modelDir(id), f.name)), { force: true })
    )
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
  for (const model of LOCAL_MODELS) await cancelLocalModel(model.id)
  downloads.clear()
  await rm(modelsRoot(), { recursive: true, force: true })
  await rm(engineRoot(), { recursive: true, force: true })
  broadcast()
}
