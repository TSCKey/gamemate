// Streams the game window (chosen by GameMate) and measures a small copy of a frame a few times a
// second. Only the numbers go back to GameMate; frames stay in this window and are never stored.
// A full-size picture of one region is sent back only when GameMate asks for text to read.
import { measureSilksong } from '../../../shared/screen/silksong'
import type { Box, ScreenStart } from '../../../preload/index.d'

interface Running {
  stream: MediaStream
  // Holds the latest full-size frame: grab() crops from it.
  video: HTMLVideoElement
  canvas: OffscreenCanvas
  context: OffscreenCanvasRenderingContext2D
  // The game's client area in each picture: only this part is measured and grabbed.
  crop: Box
  timer: ReturnType<typeof setInterval>
}

let running: Running | null = null
// Counts starts and stops, so a stream that opens after a newer request is dropped.
let generation = 0

async function start({
  sourceId,
  fps,
  width,
  maxWidth,
  maxHeight,
  crop
}: ScreenStart): Promise<void> {
  stop()
  const mine = generation
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth,
          maxHeight,
          // Frames are only looked at this often, so the capture needn't make more.
          maxFrameRate: fps
        }
      }
    } as MediaStreamConstraints)
  } catch (error) {
    console.warn('Could not capture the game window', error)
    return
  }
  if (mine !== generation) {
    for (const track of stream.getTracks()) track.stop()
    return
  }
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream
  await video.play().catch(() => {})
  if (mine !== generation) {
    for (const track of stream.getTracks()) track.stop()
    return
  }
  const canvas = new OffscreenCanvas(width, 1)
  // Left on the GPU, which scales a large frame down quickly; reading back the small copy then
  // costs about 3 ms whatever the window's size. (A canvas kept in memory took 1.5 ms for a
  // 1600x940 window but 9 ms for a 2000x1165 one.)
  const context = canvas.getContext('2d')
  if (!context) {
    for (const track of stream.getTracks()) track.stop()
    return
  }
  const timer = setInterval(() => measure(width), 1000 / fps)
  running = { stream, video, canvas, context, crop, timer }
}

// The client area in the video's pixels, or null before the first frame.
function clientPixels(
  video: HTMLVideoElement,
  crop: Box
): { x: number; y: number; width: number; height: number } | null {
  const { videoWidth, videoHeight } = video
  if (!videoWidth || !videoHeight) return null
  const x = Math.min(videoWidth - 1, Math.round(crop.x * videoWidth))
  const y = Math.min(videoHeight - 1, Math.round(crop.y * videoHeight))
  return {
    x,
    y,
    width: Math.max(1, Math.min(videoWidth - x, Math.round(crop.width * videoWidth))),
    height: Math.max(1, Math.min(videoHeight - y, Math.round(crop.height * videoHeight)))
  }
}

function measure(width: number): void {
  if (!running) return
  const { video, canvas, context, crop } = running
  const client = clientPixels(video, crop)
  if (!client) return
  // The same width whatever the window's size, so each measurement costs the same.
  const height = Math.max(1, Math.round((width * client.height) / client.width))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  context.drawImage(video, client.x, client.y, client.width, client.height, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  window.api.screen.measure(measureSilksong({ width, height, data }))
}

// A full-size PNG of one region (a part of the client area) of the latest frame, or null without
// a frame.
async function grab(box: Box): Promise<Uint8Array | null> {
  if (!running) return null
  const { video, crop } = running
  const client = clientPixels(video, crop)
  if (!client) return null
  const x = client.x + Math.round(box.x * client.width)
  const y = client.y + Math.round(box.y * client.height)
  const width = Math.min(client.x + client.width - x, Math.round(box.width * client.width))
  const height = Math.min(client.y + client.height - y, Math.round(box.height * client.height))
  if (width <= 0 || height <= 0) return null
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(video, x, y, width, height, 0, 0, width, height)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

function stop(): void {
  generation++
  if (!running) return
  clearInterval(running.timer)
  for (const track of running.stream.getTracks()) track.stop()
  running.video.srcObject = null
  running = null
}

// Follows GameMate's start, stop and grab requests; returns a function that stops listening.
export function watchScreen(): () => void {
  const stopStart = window.api.screen.onStart((request) => void start(request))
  const stopStop = window.api.screen.onStop(stop)
  const stopGrab = window.api.screen.onGrab(async (id, box) => {
    const png = await grab(box).catch((error) => {
      console.warn('Could not crop the game window', error)
      return null
    })
    window.api.screen.grabbed(id, png)
  })
  return () => {
    stopStart()
    stopStop()
    stopGrab()
    stop()
  }
}
