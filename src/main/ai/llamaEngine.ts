// Runs GameMate's built-in AI engine (llama.cpp's llama-server) as child processes: one for the
// main model and one for the comment writer, each started on first use, stopped after a few
// idle minutes and whenever GameMate quits, so nothing keeps running in the background.
import { execFile, spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { once } from 'events'
import { createServer, type AddressInfo } from 'net'
import { promisify } from 'util'
import { tieToGameMate } from '../system/jobObject'
import type { EngineServer } from './llamaClient'
import { engineDir, engineExe, localModelFiles, type ModelPaths } from './localModels'
import { t } from '../system/i18n'
import { getSettings } from '../system/settings'
import { UnreachableError } from './errors'

const IDLE_MS = Number(process.env.GAMEMATE_ENGINE_IDLE_MS) || 5 * 60_000
const START_TIMEOUT_MS = 180_000
// Enough for GameMate's prompts, a screenshot and a few looked-up pages, without reserving the
// model's full (very large) context in graphics memory.
const CONTEXT_TOKENS = 12288
// Small models can think for thousands of tokens before answering (over a minute). The cap keeps
// the first words within seconds: a laptop RTX 4050 writes about 43 tokens a second, so 512 were
// 12 s of waiting; 256 are about 6 s. (192 was no faster with a wiki page to answer from, and
// once got the Ender Dragon's crystals wrong.)
const THINKING_TOKENS = 256
const THINKING_DONE = 'Okay, I have thought enough; time to answer.'

interface Running {
  modelId: string
  // Started with the screenshot reader (or the comment writer) off the graphics card.
  saving: boolean
  proc: ChildProcess
  server: EngineServer
  log: string[]
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}

// Integrated graphics share the PC's memory and are much slower, so prefer a dedicated card.
const INTEGRATED =
  /radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|uhd graphics|iris|hd graphics|intel\(r\) graphics/i

export interface Devices {
  // The graphics card the model runs on (null: llama.cpp's own choice).
  main: string | null
  // An integrated graphics chip that is free to help out, if the PC has one besides the card.
  spare: string | null
}

// Reads llama-server's --list-devices.
export function chooseDevices(stdout: string): Devices {
  const devices = [...stdout.matchAll(/^\s*(\S+): (.+?) \((\d+) MiB, (\d+) MiB free\)/gm)].map(
    (m) => ({ id: m[1], name: m[2], free: Number(m[4]) })
  )
  // With one device (or none), llama.cpp's own choice is right.
  if (devices.length < 2) return { main: null, spare: null }
  const dedicated = devices.filter((d) => !INTEGRATED.test(d.name))
  const pool = dedicated.length ? dedicated : devices
  const main = pool.sort((a, b) => b.free - a.free)[0].id
  const spare = dedicated.length ? devices.find((d) => INTEGRATED.test(d.name)) : undefined
  return { main, spare: spare?.id ?? null }
}

let devices: Promise<Devices> | null = null

function pickDevices(): Promise<Devices> {
  devices ??= promisify(execFile)(engineExe(), ['--list-devices'], { cwd: engineDir() })
    .then(({ stdout }) => chooseDevices(stdout))
    .catch(() => ({ main: null, spare: null }))
  return devices
}

// Where the part of the model that reads screenshots runs.
export type VisionPlace = 'card' | 'processor' | { device: string }

// On the graphics card it reads a screenshot in under a second, and takes about 870 MB of the
// card's memory. A player who wants that memory for the game moves it to the PC's integrated
// graphics chip (a few seconds per screenshot), or to the processor when there is none (slower).
export function visionPlace(saveGraphicsMemory: boolean, found: Devices): VisionPlace {
  if (!saveGraphicsMemory) return 'card'
  return found.spare ? { device: found.spare } : 'processor'
}

function friendlyError(log: string[]): string {
  const text = log.join('\n')
  if (
    /out of (device )?memory|ErrorOutOfDeviceMemory|failed to allocate|unable to allocate/i.test(
      text
    )
  ) {
    return t('errors.builtin.noGraphicsMemory')
  }
  if (/failed to load model|error loading model|invalid magic|failed to read/i.test(text)) {
    return t('errors.builtin.badModelFile')
  }
  const last = log.filter((l) => /error|fail/i.test(l)).at(-1) ?? log.at(-1) ?? 'no details'
  return t('errors.builtin.couldNotStart', { detail: last.trim().slice(0, 160) })
}

async function waitUntilReady(run: Running): Promise<void> {
  // once() also rejects on a spawn error; either way, explain from the log.
  const exited = once(run.proc, 'exit')
    .catch(() => undefined)
    .then(() => {
      throw new UnreachableError(friendlyError(run.log))
    })
  const deadline = Date.now() + START_TIMEOUT_MS
  const poll = (async () => {
    while (Date.now() < deadline) {
      const ok = await fetch(`${run.server.url}/health`, {
        headers: { Authorization: `Bearer ${run.server.apiKey}` },
        signal: AbortSignal.timeout(2000)
      })
        .then((res) => res.ok)
        .catch(() => false)
      if (ok) return
      await new Promise((r) => setTimeout(r, 300))
    }
    throw new UnreachableError(t('errors.builtin.slowStart'))
  })()
  await Promise.race([poll, exited])
}

// The engine's command line.
export function engineArgs(
  files: ModelPaths,
  port: number,
  apiKey: string,
  gpu: string | null,
  vision: VisionPlace = 'card'
): string[] {
  return [
    ...['-m', files.model, ...(files.mmproj ? ['--mmproj', files.mmproj] : [])],
    // Only GameMate may talk to it: local address, random port and a random key.
    ...['--host', '127.0.0.1', '--port', String(port), '--api-key', apiKey],
    ...['-c', String(CONTEXT_TOKENS), '-np', '1', '--cache-ram', '256', '--no-webui'],
    ...['--reasoning-budget', String(THINKING_TOKENS), '--reasoning-budget-message', THINKING_DONE],
    // The conversation's cache in 8 bits instead of 16: less graphics memory, same answers.
    ...['-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0'],
    ...(gpu ? ['-dev', gpu] : []),
    ...(vision === 'card'
      ? []
      : vision === 'processor'
        ? ['--no-mmproj-offload']
        : ['-mmdev', vision.device])
  ]
}

// The comment writer is small (about 1 GB) and needs only a few hundred words of context.
const COMMENTARY_CONTEXT_TOKENS = 4096

// The comment writer's command line: the model with GameMate's fine-tuning, text only. It runs
// with the main model on the graphics card, or, for a player who wants the card's memory for the
// game, on the integrated graphics chip (measured on a laptop: 0.4 s a comment instead of 0.2 s)
// or else on the processor (0.6 s).
export function commentaryArgs(
  files: ModelPaths,
  port: number,
  apiKey: string,
  gpu: string | null,
  place: VisionPlace = 'card'
): string[] {
  return [
    '-m',
    files.model,
    // Every fine-tuning, none applied until a comment picks one (engines.ts writeComment).
    ...(files.adapters ?? []).flatMap((a) => ['--lora', a.path]),
    ...(files.adapters?.length ? ['--lora-init-without-apply'] : []),
    ...['--host', '127.0.0.1', '--port', String(port), '--api-key', apiKey],
    ...['-c', String(COMMENTARY_CONTEXT_TOKENS), '-np', '1', '--no-webui'],
    ...['-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0'],
    ...(place === 'card'
      ? gpu
        ? ['-dev', gpu]
        : []
      : place === 'processor'
        ? ['-dev', 'none', '-ngl', '0']
        : ['-dev', place.device])
  ]
}

interface SlotKind {
  // How the log names it.
  name: string
  args: (
    files: ModelPaths,
    port: number,
    apiKey: string,
    found: Devices,
    saving: boolean
  ) => string[]
}

async function stopProcess(run: Running | null): Promise<void> {
  if (!run || run.proc.exitCode !== null) return
  const exited = once(run.proc, 'exit').catch(() => undefined)
  run.proc.kill()
  await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))])
}

// One llama-server: started on first use, stopped when idle, started again after a crash.
class EngineSlot {
  private current: Promise<Running> | null = null
  private currentModel = ''
  // The engine that finished starting, so a crash can be told apart from a planned stop.
  private activeRun: Running | null = null
  private busy = 0
  private idleTimer: NodeJS.Timeout | null = null

  constructor(private readonly kind: SlotKind) {}

  private async start(modelId: string): Promise<Running> {
    const files = localModelFiles(modelId)
    const [port, found] = await Promise.all([freePort(), pickDevices()])
    const apiKey = randomBytes(24).toString('hex')
    const saving = getSettings().saveGraphicsMemory
    const args = this.kind.args(files, port, apiKey, found, saving)
    const proc = spawn(engineExe(), args, {
      cwd: engineDir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const run: Running = {
      modelId,
      saving,
      proc,
      server: { url: `http://127.0.0.1:${port}`, apiKey },
      log: []
    }
    const collect = (chunk: Buffer): void => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue
        run.log.push(line)
        if (run.log.length > 80) run.log.shift()
      }
    }
    proc.stdout?.on('data', collect)
    proc.stderr?.on('data', collect)
    proc.on('error', (error) => run.log.push(`error: ${error.message}`))
    tieToGameMate(proc.pid)
    proc.on('exit', (code) => {
      // If it stops on its own (crash), the next request starts it again.
      if (this.activeRun === run) {
        console.warn(
          `${this.kind.name} stopped unexpectedly (exit code ${code}):\n${run.log.slice(-15).join('\n')}`
        )
        this.activeRun = null
        this.current = null
        this.currentModel = ''
      }
    })
    const started = Date.now()
    const device = args.includes('-dev') ? args[args.indexOf('-dev') + 1] : null
    const where = device === 'none' ? 'the processor' : (device ?? 'the default device')
    console.info(`${this.kind.name} starting ${modelId} on ${where}`)
    try {
      await waitUntilReady(run)
    } catch (error) {
      console.error(`${this.kind.name} failed to start:\n${run.log.slice(-15).join('\n')}`)
      proc.kill()
      throw error
    }
    console.info(`${this.kind.name} ready in ${((Date.now() - started) / 1000).toFixed(1)} s`)
    return run
  }

  private ensure(modelId: string): Promise<Running> {
    if (this.current && this.currentModel === modelId) return this.current
    const previous = this.current
    this.currentModel = modelId
    const attempt = (async () => {
      // Switching models: the old one has to make room first.
      if (previous) await stopProcess(await previous.catch(() => null))
      const run = await this.start(modelId)
      this.activeRun = run
      return run
    })()
    this.current = attempt
    attempt.catch(() => {
      if (this.current === attempt) {
        this.current = null
        this.currentModel = ''
      }
    })
    return attempt
  }

  async with<T>(modelId: string, task: (server: EngineServer) => Promise<T>): Promise<T> {
    this.busy++
    if (this.idleTimer) clearTimeout(this.idleTimer)
    try {
      const run = await this.ensure(modelId)
      return await task(run.server)
    } finally {
      this.busy--
      if (this.busy === 0) {
        this.idleTimer = setTimeout(() => void this.stop(), IDLE_MS)
        this.idleTimer.unref()
      }
    }
  }

  async stop(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    const pending = this.current
    this.current = null
    this.currentModel = ''
    this.activeRun = null
    if (!pending) return
    console.info(`${this.kind.name} stopped`)
    await stopProcess(await pending.catch(() => null))
  }

  running(): string | null {
    return this.currentModel || null
  }

  upToDate(settings: { saveGraphicsMemory: boolean }): boolean {
    return !this.activeRun || this.activeRun.saving === settings.saveGraphicsMemory
  }
}

// The main model: answers, screenshots, and comments unless the comment writer has them.
const main = new EngineSlot({
  name: 'AI engine',
  args: (files, port, apiKey, found, saving) =>
    engineArgs(files, port, apiKey, found.main, visionPlace(saving, found))
})

// The fine-tuned comment writer, beside the main model.
const commentary = new EngineSlot({
  name: 'Comment writer',
  args: (files, port, apiKey, found, saving) =>
    commentaryArgs(files, port, apiKey, found.main, visionPlace(saving, found))
})

// Runs `task` against the main engine with `modelId` loaded, starting it if needed.
export function withEngine<T>(
  modelId: string,
  task: (server: EngineServer) => Promise<T>
): Promise<T> {
  return main.with(modelId, task)
}

// The same for the comment writer.
export function withCommentaryEngine<T>(
  modelId: string,
  task: (server: EngineServer) => Promise<T>
): Promise<T> {
  return commentary.with(modelId, task)
}

// Frees every model's memory now (GameMate quitting, or the player deleting their data).
export async function stopEngine(): Promise<void> {
  await Promise.all([main.stop(), commentary.stop()])
}

// Frees only the main model's memory (it is no longer the one in use, or is being deleted).
export function stopMainEngine(): Promise<void> {
  return main.stop()
}

export function stopCommentaryEngine(): Promise<void> {
  return commentary.stop()
}

// The model the main engine has loaded right now, if any.
export function runningModel(): string | null {
  return main.running()
}

// Whether the running engines were started the way the settings ask now (a different place for
// reading screenshots or writing comments takes a restart).
export function engineUpToDate(settings: { saveGraphicsMemory: boolean }): boolean {
  return main.upToDate(settings)
}

export function commentaryEngineUpToDate(settings: { saveGraphicsMemory: boolean }): boolean {
  return commentary.upToDate(settings)
}
