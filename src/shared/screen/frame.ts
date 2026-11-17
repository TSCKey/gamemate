// Light measurements on a downscaled game frame. Pure, so it runs in both main and renderer.

export interface Frame {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel. */
  data: Uint8ClampedArray
}

/** A region as fractions (0-1) of the frame, so it means the same at any frame size. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const WHOLE: Box = { x: 0, y: 0, width: 1, height: 1 }

/** How much darker a neighbour must be for a bright pixel to count as an edge. */
const EDGE_DROP = 0.35

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

// Rounded and clamped so a box at the frame's edge never reads outside the data.
function toRect(frame: Frame, box: Box): Rect {
  const clamp = (v: number, max: number): number => Math.min(max, Math.max(0, v))
  return {
    x0: clamp(Math.round(box.x * frame.width), frame.width),
    y0: clamp(Math.round(box.y * frame.height), frame.height),
    x1: clamp(Math.round((box.x + box.width) * frame.width), frame.width),
    y1: clamp(Math.round((box.y + box.height) * frame.height), frame.height)
  }
}

function lumaAt(frame: Frame, x: number, y: number): number {
  const i = (y * frame.width + x) * 4
  const d = frame.data
  return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255
}

export function meanBrightness(frame: Frame, box: Box = WHOLE): number {
  const { x0, y0, x1, y1 } = toRect(frame, box)
  const total = (x1 - x0) * (y1 - y0)
  if (total <= 0) return 0
  let sum = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += lumaAt(frame, x, y)
  return sum / total
}

/**
 * How much the box looks like bright text on a darker background: the share of its pixels
 * that are bright (at or above minLuma) and touch a neighbour at least 0.35 darker.
 * A flat bright or flat dark area has no such edges and scores about 0.
 */
export function brightTextScore(frame: Frame, box: Box, minLuma: number): number {
  const { x0, y0, x1, y1 } = toRect(frame, box)
  const total = (x1 - x0) * (y1 - y0)
  if (total <= 0) return 0
  let hits = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const luma = lumaAt(frame, x, y)
      if (luma < minLuma) continue
      // Neighbours just outside the box still count: the text edge may sit on the border.
      const darker =
        (x > 0 && luma - lumaAt(frame, x - 1, y) >= EDGE_DROP) ||
        (x < frame.width - 1 && luma - lumaAt(frame, x + 1, y) >= EDGE_DROP) ||
        (y > 0 && luma - lumaAt(frame, x, y - 1) >= EDGE_DROP) ||
        (y < frame.height - 1 && luma - lumaAt(frame, x, y + 1) >= EDGE_DROP)
      if (darker) hits++
    }
  }
  return hits / total
}

export function colourShare(
  frame: Frame,
  box: Box,
  test: (r: number, g: number, b: number) => boolean
): number {
  const { x0, y0, x1, y1 } = toRect(frame, box)
  const total = (x1 - x0) * (y1 - y0)
  if (total <= 0) return 0
  let hits = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * frame.width + x) * 4
      if (test(frame.data[i], frame.data[i + 1], frame.data[i + 2])) hits++
    }
  }
  return hits / total
}
