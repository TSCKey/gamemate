// Where Silksong puts its on-screen elements, and a light measurement of one frame.
// Pure, so it runs in both main and renderer.
import { brightTextScore, colourShare, meanBrightness, type Box, type Frame } from './frame'

export interface SilksongLayout {
  /** One box per health mask, left to right. */
  masks: Box[]
  /** True when a pixel looks like a filled (healthy) mask. */
  maskFilled: (r: number, g: number, b: number) => boolean
  areaTitle: Box
  bossTitle: Box
  pickup: Box
  /** Lowest brightness (0-1) that counts as text. */
  textLuma: number
}

// First estimates for a 16:9 frame. They are to be measured from real footage and replaced.
const MASK_COUNT = 10
const MASK_BOXES: Box[] = Array.from({ length: MASK_COUNT }, (_, i) => ({
  x: 0.1 + i * 0.03,
  y: 0.05,
  width: 0.022,
  height: 0.05
}))

export const SILKSONG_LAYOUT: SilksongLayout = {
  masks: MASK_BOXES,
  maskFilled: (r, g, b) => r > 200 && g > 200 && b > 200,
  areaTitle: { x: 0.3, y: 0.2, width: 0.4, height: 0.1 },
  bossTitle: { x: 0.3, y: 0.75, width: 0.4, height: 0.1 },
  pickup: { x: 0.25, y: 0.55, width: 0.5, height: 0.1 },
  textLuma: 0.6
}

export interface SilksongMeasure {
  brightness: number
  /** How many health masks look filled. */
  masks: number
  areaText: number
  bossText: number
  pickupText: number
}

/** A mask counts as filled when at least this share of its box passes the colour test. */
const MASK_FILLED_SHARE = 0.5

export function measureSilksong(
  frame: Frame,
  layout: SilksongLayout = SILKSONG_LAYOUT
): SilksongMeasure {
  return {
    brightness: meanBrightness(frame),
    masks: layout.masks.filter(
      (box) => colourShare(frame, box, layout.maskFilled) >= MASK_FILLED_SHARE
    ).length,
    areaText: brightTextScore(frame, layout.areaTitle, layout.textLuma),
    bossText: brightTextScore(frame, layout.bossTitle, layout.textLuma),
    pickupText: brightTextScore(frame, layout.pickup, layout.textLuma)
  }
}

/** A fade to black between scenes, when nothing else on screen is worth reading. */
export function isBlackFrame(m: SilksongMeasure): boolean {
  return m.brightness < 0.01
}
