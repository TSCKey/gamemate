// Runs GameMate's built-in AI engine (llama.cpp's llama-server) as a child process: started on
// first use, stopped after a few idle minutes and whenever GameMate quits, so nothing keeps
// running in the background.
import { execFile, spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { once } from 'events'
import { createServer, type AddressInfo } from 'net'
import { promisify } from 'util'
import { tieToGameMate } from '../system/jobObject'
import type { EngineServer } from './llamaClient'
import { engineDir, engineExe, localModelFiles } from './localModels'
import { t } from '../system/i18n'
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
  proc: ChildProcess
  server: EngineServer
  log: string[]
}

let current: Promise<Running> | null = null
let currentModel = ''
// The engine that finished starting, so a crash can be told apart from a planned stop.
let activeRun: Running | null = null
let busy = 0
let idleTimer: NodeJS.Timeout | null = null

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
let device: Promise<string | null> | null = null

function pickDevice(): Promise<string | null> {
  device ??= promisify(execFile)(engineExe(), ['--list-devices'], { cwd: engineDir() })
    .then(({ stdout }) => {
      const devices = [...stdout.matchAll(/^\s*(\S+): (.+?) \((\d+) MiB, (\d+) MiB free\)/gm)].map(
        (m) => ({ id: m[1], name: m[2], free: Number(m[4]) })
      )
      // With one device (or none), llama.cpp's own choice is right.
      if (devices.length < 2) return null
      const dedicated = devices.filter((d) => !INTEGRATED.test(d.name))
      const pool = dedicated.length ? dedicated : devices
      return pool.sort((a, b) => b.free - a.free)[0].id
    })
    .catch(() => null)
  return device
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
  files: { model: string; mmproj: string },
  port: number,
  apiKey: string,
  gpu: string | null
): string[] {
  return [
    ...['-m', files.model, '--mmproj', files.mmproj],
    // Only GameMate may talk to it: local address, random port and a random key.
    ...['--host', '127.0.0.1', '--port', String(port), '--api-key', apiKey],
    ...['-c', String(CONTEXT_TOKENS), '-np', '1', '--cache-ram', '256', '--no-webui'],
    ...['--reasoning-budget', String(THINKING_TOKENS), '--reasoning-budget-message', THINKING_DONE],
    ...(gpu ? ['-dev', gpu] : [])
  ]
}

async function start(modelId: string): Promise<Running> {
  const files = localModelFiles(modelId)
  const [port, gpu] = await Promise.all([freePort(), pickDevice()])
  const apiKey = randomBytes(24).toString('hex')
  const args = engineArgs(files, port, apiKey, gpu)
  const proc = spawn(engineExe(), args, {
    cwd: engineDir(),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const run: Running = {
    modelId,
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
    // If it stops on its own (crash), the next question starts it again.
    if (activeRun === run) {
      console.warn(
        `AI engine stopped unexpectedly (exit code ${code}):\n${run.log.slice(-15).join('\n')}`
      )
      activeRun = null
      current = null
      currentModel = ''
    }
  })
  const started = Date.now()
  console.info(`AI engine starting ${modelId} on ${gpu ?? 'the default device'}`)
  try {
    await waitUntilReady(run)
  } catch (error) {
    console.error(`AI engine failed to start:\n${run.log.slice(-15).join('\n')}`)
    proc.kill()
    throw error
  }
  console.info(`AI engine ready in ${((Date.now() - started) / 1000).toFixed(1)} s`)
  return run
}

function ensure(modelId: string): Promise<Running> {
  if (current && currentModel === modelId) return current
  const previous = current
  currentModel = modelId
  current = (async () => {
    // Switching models: the old one has to make room first.
    if (previous) await stopProcess(await previous.catch(() => null))
    const run = await start(modelId)
    activeRun = run
    return run
  })()
  const attempt = current
  attempt.catch(() => {
    if (current === attempt) {
      current = null
      currentModel = ''
    }
  })
  return attempt
}

async function stopProcess(run: Running | null): Promise<void> {
  if (!run || run.proc.exitCode !== null) return
  const exited = once(run.proc, 'exit').catch(() => undefined)
  run.proc.kill()
  await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))])
}

// Runs `task` against the engine with `modelId` loaded, starting the engine if needed.
export async function withEngine<T>(
  modelId: string,
  task: (server: EngineServer) => Promise<T>
): Promise<T> {
  busy++
  if (idleTimer) clearTimeout(idleTimer)
  try {
    const run = await ensure(modelId)
    return await task(run.server)
  } finally {
    busy--
    if (busy === 0) {
      idleTimer = setTimeout(() => void stopEngine(), IDLE_MS)
      idleTimer.unref()
    }
  }
}

// Frees the model's memory now (GameMate quitting, idle, or the model being deleted).
export async function stopEngine(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  const pending = current
  current = null
  currentModel = ''
  activeRun = null
  if (!pending) return
  console.info('AI engine stopped')
  await stopProcess(await pending.catch(() => null))
}

// The model the engine has loaded right now, if any.
export function runningModel(): string | null {
  return currentModel || null
}
