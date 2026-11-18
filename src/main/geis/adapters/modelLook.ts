// What the two vision-model adapters share: the cheap checks on tiny frames that decide whether
// a look is worth the GPU, and the look itself. Only one look runs at a time, whichever adapter
// asks, and both keep to one pace (the last look's time and how long it took).
import type { NativeImage } from 'electron'
import { toScreenshot } from '../../windows/capture'
import { complete } from '../../ai/llm'
import { engineFor } from '../../ai/engines'
import { isAsking } from '../../ai/assistant'
import type { Settings } from '../../system/settings'
import type { GameProfile } from '../../games/catalog'
import type { FrameReport } from '../../companion/events'
import type { AdapterHost } from '../adapter'

export const DIFF_FRAME_WIDTH = 64
// Even if the scene looks the same, take a fresh look this often.
export const MAX_ANALYSIS_GAP_MS = 60_000

export interface FrameStats {
  pixels: Float32Array
  brightness: number
  redness: number
}

// When the model last looked, and how long it took to read that look.
export const lookTimes = { lastAt: 0, lastMs: 0 }
let lookingNow = false

// Tiny grayscale frame plus overall brightness and how red the screen is
// (Minecraft flashes red when you take damage and the death screen is red).
export function frameStats(image: NativeImage): FrameStats {
  // Already captured this small; only an odd-sized capture is scaled.
  const small =
    image.getSize().width === DIFF_FRAME_WIDTH
      ? image
      : image.resize({ width: DIFF_FRAME_WIDTH, quality: 'good' })
  const bitmap = small.toBitmap() // BGRA
  const count = bitmap.length / 4
  const pixels = new Float32Array(count)
  let brightness = 0
  let red = 0
  let other = 0
  for (let i = 0; i < count; i++) {
    const b = bitmap[i * 4] / 255
    const g = bitmap[i * 4 + 1] / 255
    const r = bitmap[i * 4 + 2] / 255
    pixels[i] = 0.299 * r + 0.587 * g + 0.114 * b
    brightness += pixels[i]
    red += r
    other += (g + b) / 2
  }
  return { pixels, brightness: brightness / count, redness: red / Math.max(other, 1e-6) }
}

export function sceneChange(a: FrameStats, b: FrameStats): number {
  if (a.pixels.length !== b.pixels.length) return 1
  let diff = 0
  for (let i = 0; i < a.pixels.length; i++) diff += Math.abs(a.pixels[i] - b.pixels[i])
  return diff / a.pixels.length
}

// One tick of a model adapter: the game is being watched, and unless the player is asking
// something (their question gets the GPU first) or a look is still underway, `look` runs.
export async function watchWithModel(
  host: AdapterHost,
  settings: Settings,
  game: GameProfile,
  look: () => Promise<void>
): Promise<void> {
  host.setState({ status: 'watching', game: game.name })
  if (isAsking() || lookingNow) return
  lookingNow = true
  try {
    // A comment that was waiting for a fight to end or for a cooldown may be due now.
    await host.speakIfDue(game, settings)
    await look()
  } finally {
    lookingNow = false
  }
}

export interface Look {
  adapterId: string
  displayId: number
  capturedAt: number
  images: NativeImage[]
  prompt: string
  schema: object
  read: (reply: unknown, capturedAt: number) => FrameReport
}

export async function readLook(
  host: AdapterHost,
  look: Look,
  settings: Settings,
  game: GameProfile
): Promise<void> {
  const { displayId, capturedAt, images, prompt, schema, read } = look
  const forgetsBefore = host.forgets()
  host.setState({ status: 'analyzing' })
  try {
    const reply = await complete(
      engineFor('commentary'),
      [
        {
          role: 'user',
          content: prompt,
          images: images.map((image) => toScreenshot(image).base64)
        }
      ],
      // Thinking would make each look take several times longer.
      { jsonSchema: schema, fast: true }
    )
    lookTimes.lastMs = Date.now() - capturedAt
    // The player turned the companion off or deleted their data while the model was reading.
    if (host.forgets() !== forgetsBefore) return
    const report = { ...read(JSON.parse(reply.content), capturedAt), adapterId: look.adapterId }
    host.observe(report, game, report.description)
    host.showCommentsOn(displayId)
    await host.speakIfDue(game, settings)
  } catch (error) {
    console.error('Observation failed', error)
  } finally {
    if (host.status() === 'analyzing') host.setState({ status: 'watching' })
  }
}
