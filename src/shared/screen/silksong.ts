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

// Masks measured on the owner's own Silksong frames (1920x1080, Windowed Fullscreen,
// 2026-11-17): each mask sits 28x42 px from (191 + 50 * i, 84), one every 50 px. The other boxes
// are still first estimates, to be measured from frames that show them.
const MASK_COUNT = 10
const MASK_BOXES: Box[] = Array.from({ length: MASK_COUNT }, (_, i) => ({
  x: (191 + 50 * i) / 1920,
  y: 84 / 1080,
  width: 28 / 1920,
  height: 42 / 1080
}))

export const SILKSONG_LAYOUT: SilksongLayout = {
  masks: MASK_BOXES,
  maskFilled: (r, g, b) => r > 200 && g > 200 && b > 200,
  // The area card's name line, measured on the owner's recording ("ACT 2" sits just above it).
  areaTitle: { x: 0.2, y: 0.47, width: 0.6, height: 0.12 },
  // The boss title, bottom left ("LAST" over "JUDGE"), measured on the owner's Last Judge clip.
  bossTitle: { x: 0.04, y: 0.8, width: 0.36, height: 0.16 },
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

/**
 * A mask counts as filled when at least this share of its box passes the colour test. A full mask
 * measured 0.18-0.27 white (its face is drawn dark), an empty one 0.
 */
const MASK_FILLED_SHARE = 0.1

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
