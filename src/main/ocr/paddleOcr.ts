// PaddleOCR (PP-OCRv6 small, Apache 2.0) in TypeScript: the steps around its two ONNX models,
// ported from RapidOCR 3.10 (Apache 2.0). On the owner's 12 VALORANT clips it read 97% of 279
// kill-feed names exactly and 3% nearly, and the player's own name in all 51 of their lines
// (Windows OCR: 30% exactly, 23 of 51). Text is assumed to run level, as it does in a kill feed:
// boxes are upright rectangles, never turned. Free of Electron and of the runtime, so it can be
// tested with fake models.

// One model call: a float tensor in, the first output back.
export interface OcrModel {
  run(data: Float32Array, dims: number[]): Promise<{ data: Float32Array; dims: readonly number[] }>
}

// Pixels as Windows gives them (nativeImage.toBitmap): 4 bytes each, blue, green, red, alpha.
// PaddleOCR's models were trained on blue-green-red images too.
export interface BgraImage {
  width: number
  height: number
  data: Uint8Array
}

export interface OcrSegment {
  text: string
  score: number
  x: number
  y: number
  width: number
  height: number
}

// How the detection model is fed and its map read.
export interface DetectSettings {
  // The image is scaled so its shorter ('min') or longer ('max') side is this, when it isn't.
  limitSide: number
  limitType: 'min' | 'max'
  // Per channel, in blue-green-red order, after scaling to 0-1.
  mean: [number, number, number]
  std: [number, number, number]
  thresh: number
  boxThresh: number
  unclipRatio: number
}

// The official model's own normalisation and map thresholds (its inference.yml), with the image
// scaled up as RapidOCR does: kill-feed text is small, and without the scaling the player's own
// name was missed in 3 of their 51 lines.
export const PADDLE_DETECT: DetectSettings = {
  limitSide: 736,
  limitType: 'min',
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  thresh: 0.2,
  boxThresh: 0.45,
  unclipRatio: 1.4
}

// Banners: big letters in a wide, short strip. Scaled up like the feed, a 1080p banner strip was
// read at about 4080 x 736 pixels, which kept a processor core busy through the owner's live
// match; the letters need no scaling at all.
export const PADDLE_BANNER_DETECT: DetectSettings = {
  ...PADDLE_DETECT,
  limitSide: 960,
  limitType: 'max'
}

// The score strip at the top: 70 pixels high at 1080p, scaled to about twice that. The owner's
// clips read right this way at about 0.14 s a read.
export const PADDLE_SCORE_DETECT: DetectSettings = {
  ...PADDLE_DETECT,
  limitSide: 96
}

// What is being read: small kill-feed text, a banner's big letters, or the score strip.
export type TextKind = 'feed' | 'banner' | 'score'

export const DETECT_FOR: Record<TextKind, DetectSettings> = {
  feed: PADDLE_DETECT,
  banner: PADDLE_BANNER_DETECT,
  score: PADDLE_SCORE_DETECT
}

const DET_MAX_CANDIDATES = 1000
const DET_MIN_SIZE = 3
const REC_HEIGHT = 48
const REC_WIDTH = 320
const REC_BATCH = 6
const TEXT_SCORE = 0.5
// Boxes this close in height are one line, read left to right.
const SAME_LINE_PX = 10

// The characters in PaddleOCR's own model settings (inference.yml): the list under
// PostProcess > character_dict, one "  - " item per line, quoted the way YAML quotes.
export function yamlCharacters(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === 'character_dict:')
  if (start < 0) throw new Error('The text model settings have no character list')
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    const item = /^\s*- (.*)$/.exec(line)
    if (!item) break
    const value = item[1]
    if (value.startsWith("'")) out.push(value.slice(1, -1).replace(/''/g, "'"))
    else if (value.startsWith('"')) out.push(JSON.parse(value) as string)
    else out.push(value)
  }
  return out
}

// The character table PaddleOCR decodes with: "blank" first, a space last.
export function ctcTable(characters: string[]): string[] {
  return ['', ...characters, ' ']
}

// What the recognition model expects: (value / 255 - 0.5) / 0.5.
const HALF: Pick<DetectSettings, 'mean' | 'std'> = { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] }

// Bilinear resize of part of the image into a normalised blue-green-red tensor, as OpenCV's
// resize (pixel centres) and PaddleOCR's normalisation ((value / 255 - mean) / std) do.
function resizeInto(
  image: BgraImage,
  box: { x: number; y: number; width: number; height: number },
  outWidth: number,
  outHeight: number,
  target: Float32Array,
  rowStride: number,
  offset: number,
  norm: Pick<DetectSettings, 'mean' | 'std'>
): void {
  const plane = outHeight * rowStride
  const sx = box.width / outWidth
  const sy = box.height / outHeight
  const clampX = (v: number): number => Math.min(box.width - 1, Math.max(0, v)) + box.x
  const clampY = (v: number): number => Math.min(box.height - 1, Math.max(0, v)) + box.y
  for (let oy = 0; oy < outHeight; oy++) {
    const fy = (oy + 0.5) * sy - 0.5
    const y0 = Math.floor(fy)
    const wy = fy - y0
    const ya = clampY(y0)
    const yb = clampY(y0 + 1)
    for (let ox = 0; ox < outWidth; ox++) {
      const fx = (ox + 0.5) * sx - 0.5
      const x0 = Math.floor(fx)
      const wx = fx - x0
      const xa = clampX(x0)
      const xb = clampX(x0 + 1)
      const i00 = (ya * image.width + xa) * 4
      const i01 = (ya * image.width + xb) * 4
      const i10 = (yb * image.width + xa) * 4
      const i11 = (yb * image.width + xb) * 4
      for (let c = 0; c < 3; c++) {
        const top = image.data[i00 + c] * (1 - wx) + image.data[i01 + c] * wx
        const bottom = image.data[i10 + c] * (1 - wx) + image.data[i11 + c] * wx
        const value = top * (1 - wy) + bottom * wy
        target[offset + c * plane + oy * rowStride + ox] =
          (value / 255 - norm.mean[c]) / norm.std[c]
      }
    }
  }
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

// The detection model's input size: scaled as the settings say, both sides multiples of 32.
export function detectionSize(
  width: number,
  height: number,
  settings: DetectSettings = PADDLE_DETECT
): { width: number; height: number } {
  const side = settings.limitType === 'min' ? Math.min(width, height) : Math.max(width, height)
  const scale = settings.limitSide / side
  const ratio = settings.limitType === 'min' ? Math.max(1, scale) : Math.min(1, scale)
  return {
    width: Math.max(32, Math.round(Math.trunc(width * ratio) / 32) * 32),
    height: Math.max(32, Math.round(Math.trunc(height * ratio) / 32) * 32)
  }
}

// Where the text is: PaddleOCR's DB post-processing for level text. The map is the model's
// chance of text at each of its pixels.
export function textBoxes(
  map: Float32Array,
  mapWidth: number,
  mapHeight: number,
  imageWidth: number,
  imageHeight: number,
  settings: DetectSettings = PADDLE_DETECT
): Box[] {
  // Above the threshold, then grown by one pixel up and left (OpenCV's 2x2 dilation).
  const on = new Uint8Array(mapWidth * mapHeight)
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const at = (yy: number, xx: number): boolean =>
        yy >= 0 && xx >= 0 && map[yy * mapWidth + xx] > settings.thresh
      if (at(y, x) || at(y - 1, x) || at(y, x - 1) || at(y - 1, x - 1)) on[y * mapWidth + x] = 1
    }
  }
  const seen = new Uint8Array(on.length)
  const boxes: Box[] = []
  const stack: number[] = []
  for (let start = 0; start < on.length && boxes.length < DET_MAX_CANDIDATES; start++) {
    if (!on[start] || seen[start]) continue
    let [minX, minY, maxX, maxY] = [mapWidth, mapHeight, 0, 0]
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const i = stack.pop() as number
      const x = i % mapWidth
      const y = (i - x) / mapWidth
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue
          const j = ny * mapWidth + nx
          if (on[j] && !seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
      }
    }
    // The smallest rectangle around the region's pixel centres, as OpenCV's minAreaRect.
    const w = maxX - minX
    const h = maxY - minY
    if (Math.min(w, h) < DET_MIN_SIZE) continue
    let sum = 0
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) sum += map[y * mapWidth + x]
    if (sum / ((w + 1) * (h + 1)) < settings.boxThresh) continue
    // Text regions come out thinner than the text: grow them by area * ratio / perimeter.
    const grow = (w * h * settings.unclipRatio) / (2 * (w + h))
    const [x0, y0, x1, y1] = [minX - grow, minY - grow, maxX + grow, maxY + grow]
    if (Math.min(x1 - x0, y1 - y0) < DET_MIN_SIZE + 2) continue
    const sx = (v: number): number =>
      Math.min(imageWidth, Math.max(0, Math.round((v / mapWidth) * imageWidth)))
    const sy = (v: number): number =>
      Math.min(imageHeight, Math.max(0, Math.round((v / mapHeight) * imageHeight)))
    const box = { x: sx(x0), y: sy(y0), width: sx(x1) - sx(x0), height: sy(y1) - sy(y0) }
    if (box.width <= 3 || box.height <= 3) continue
    boxes.push(box)
  }
  // Top to bottom, and left to right within a line.
  boxes.sort((a, b) => a.y - b.y)
  const lines: number[] = []
  boxes.forEach((box, i) => {
    lines.push(i === 0 ? 0 : lines[i - 1] + (box.y - boxes[i - 1].y >= SAME_LINE_PX ? 1 : 0))
  })
  return boxes
    .map((box, i) => ({ box, line: lines[i] }))
    .sort((a, b) => a.line - b.line || a.box.x - b.box.x)
    .map(({ box }) => box)
}

// Greedy CTC decoding: the likeliest character at each step, repeats and blanks dropped. The
// score is the mean chance of the characters kept.
export function ctcDecode(
  probs: Float32Array,
  steps: number,
  classes: number,
  offset: number,
  table: string[]
): { text: string; score: number } {
  let text = ''
  let total = 0
  let kept = 0
  let previous = -1
  for (let t = 0; t < steps; t++) {
    let best = 0
    let bestP = -Infinity
    const base = offset + t * classes
    for (let c = 0; c < classes; c++) {
      if (probs[base + c] > bestP) {
        bestP = probs[base + c]
        best = c
      }
    }
    if (best !== 0 && best !== previous) {
      text += table[best] ?? ''
      total += bestP
      kept++
    }
    previous = best
  }
  return { text, score: kept ? total / kept : 0 }
}

// Finds and reads all the text in an image.
export async function readImage(
  image: BgraImage,
  models: { detect: OcrModel; recognize: OcrModel; table: string[] },
  settings: DetectSettings = PADDLE_DETECT
): Promise<OcrSegment[]> {
  const size = detectionSize(image.width, image.height, settings)
  const input = new Float32Array(3 * size.width * size.height)
  resizeInto(
    image,
    { x: 0, y: 0, width: image.width, height: image.height },
    size.width,
    size.height,
    input,
    size.width,
    0,
    settings
  )
  const map = await models.detect.run(input, [1, 3, size.height, size.width])
  const mapHeight = map.dims[2]
  const mapWidth = map.dims[3]
  const boxes = textBoxes(map.data, mapWidth, mapHeight, image.width, image.height, settings)
  if (!boxes.length) return []

  // Read in batches of similar shapes, each padded to its widest.
  const order = boxes
    .map((_, i) => i)
    .sort((a, b) => boxes[a].width / boxes[a].height - boxes[b].width / boxes[b].height)
  const read: ({ text: string; score: number } | null)[] = boxes.map(() => null)
  for (let start = 0; start < order.length; start += REC_BATCH) {
    const batch = order.slice(start, start + REC_BATCH)
    const ratio = Math.max(
      REC_WIDTH / REC_HEIGHT,
      ...batch.map((i) => boxes[i].width / boxes[i].height)
    )
    const width = Math.trunc(REC_HEIGHT * ratio)
    const data = new Float32Array(batch.length * 3 * REC_HEIGHT * width)
    batch.forEach((i, n) => {
      const box = boxes[i]
      const resized = Math.min(width, Math.ceil(REC_HEIGHT * (box.width / box.height)))
      resizeInto(image, box, resized, REC_HEIGHT, data, width, n * 3 * REC_HEIGHT * width, HALF)
    })
    const out = await models.recognize.run(data, [batch.length, 3, REC_HEIGHT, width])
    const [, steps, classes] = out.dims
    batch.forEach((i, n) => {
      read[i] = ctcDecode(out.data, steps, classes, n * steps * classes, models.table)
    })
  }
  return boxes.flatMap((box, i) => {
    const r = read[i]
    return r && r.text.trim() && r.score >= TEXT_SCORE
      ? [{ ...box, text: r.text, score: r.score }]
      : []
  })
}
