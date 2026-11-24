// Rocket League's scoreboard, read straight from the pixels: the two scores and the match clock at
// the top of the screen. Their digits are drawn as thin white strokes in segments, which the text
// reader built into Windows can't read but a segment check can: each digit is cut out where the
// white strokes are, and which of its seven segments are lit says which digit it is.
//
// Measured on the owner's Rocket League clips (1080p and 720p), at the default HUD: the clock is
// centred at the top, the player's own team's score in the box left of it and the other team's
// right of it, whichever colour each team plays. Sizes are at 1920x1080 and scale with the game's
// height. Anything that doesn't read as a whole number is unknown, never a guess.
import type { BgraImage } from '../geis/adapters/teamBar'
import type { Box } from './hudAreas'

// The strip to grab, as fractions of the game window: wide enough for the scoreboard at 16:10,
// 16:9 and wider, and the top 7.5% of the height.
export const SCOREBOARD_STRIP: Box = { x: 0.36, y: 0, width: 0.28, height: 0.075 }
const STRIP_HEIGHT_1080 = 1080 * SCOREBOARD_STRIP.height

// Where things are at 1080p, in pixels from the middle of the screen and from its top. The boxes'
// inner edges (about 99 px either side of the middle) are white lines too, so each part stays
// inside them.
const CLOCK = { left: -92, right: 92, top: 20, bottom: 64 }
const OWN_SCORE = { left: -176, right: -104, top: 16, bottom: 72 }
const OTHER_SCORE = { left: 104, right: 176, top: 16, bottom: 72 }

// White strokes: bright in every channel and hardly coloured. The boxes are orange or blue, and a
// faint trail of the previous digit is tinted, so neither counts.
const WHITE_MIN = 185
const WHITE_SPREAD = 70

// A segment is lit when most of the line across or down it has ink.
const LIT = 0.6

// Which segments each digit lights, in the order a b c d e f g: top, top right, bottom right,
// bottom, bottom left, top left, middle.
const DIGITS: Record<string, string> = {
  '1111110': '0',
  '0110000': '1',
  '1101101': '2',
  '1111001': '3',
  '0110011': '4',
  '1011011': '5',
  '1011111': '6',
  '1110000': '7',
  '1111111': '8',
  '1111011': '9',
  // A 9 drawn without its bottom stroke.
  '1110011': '9'
}

export interface Scoreboard {
  // The player's team's score and the other team's, or null when either can't be read.
  own: number | null
  other: number | null
  // Seconds left on the clock (seconds played in overtime), null when it can't be read.
  seconds: number | null
  // The clock shows "+": the match is in overtime.
  overtime: boolean
}

interface Part {
  left: number
  right: number
  top: number
  bottom: number
}

interface Glyph {
  x0: number
  x1: number
  y0: number
  y1: number
}

const isInk = (img: BgraImage, x: number, y: number): boolean => {
  const i = (y * img.width + x) * 4
  const b = img.data[i]
  const g = img.data[i + 1]
  const r = img.data[i + 2]
  const lo = Math.min(r, g, b)
  return lo >= WHITE_MIN && Math.max(r, g, b) - lo <= WHITE_SPREAD
}

// The part's rectangle in the grabbed strip, in whole pixels inside it.
function place(img: BgraImage, part: Part): Part {
  const scale = img.height / STRIP_HEIGHT_1080
  const middle = img.width / 2
  const clamp = (v: number, max: number): number => Math.min(max, Math.max(0, Math.round(v)))
  return {
    left: clamp(middle + part.left * scale, img.width),
    right: clamp(middle + part.right * scale, img.width),
    top: clamp(part.top * scale, img.height),
    bottom: clamp(part.bottom * scale, img.height)
  }
}

// The separate shapes in a part, left to right: runs of columns with ink, each with the rows its
// ink spans.
function glyphs(img: BgraImage, part: Part): Glyph[] {
  const found: Glyph[] = []
  let current: Glyph | null = null
  for (let x = part.left; x < part.right; x++) {
    let y0 = -1
    let y1 = -1
    for (let y = part.top; y < part.bottom; y++) {
      if (!isInk(img, x, y)) continue
      if (y0 < 0) y0 = y
      y1 = y
    }
    if (y0 < 0) {
      if (current) found.push(current)
      current = null
      continue
    }
    if (!current) current = { x0: x, x1: x, y0, y1 }
    else {
      current.x1 = x
      current.y0 = Math.min(current.y0, y0)
      current.y1 = Math.max(current.y1, y1)
    }
  }
  if (current) found.push(current)
  return found
}

// How much of a line across (rows y, columns x0..x1) or down (column band, rows y0..y1) has ink.
function across(img: BgraImage, g: Glyph, x0: number, x1: number, y0: number, y1: number): number {
  let hit = 0
  let total = 0
  for (let x = Math.round(x0); x <= Math.round(x1); x++) {
    total++
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      if (x >= g.x0 && x <= g.x1 && isInk(img, x, y)) {
        hit++
        break
      }
    }
  }
  return total ? hit / total : 0
}

function down(img: BgraImage, g: Glyph, x0: number, x1: number, y0: number, y1: number): number {
  let hit = 0
  let total = 0
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    total++
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      if (x >= g.x0 && x <= g.x1 && isInk(img, x, y)) {
        hit++
        break
      }
    }
  }
  return total ? hit / total : 0
}

// The digit a glyph shows, or null.
function digit(img: BgraImage, g: Glyph): string | null {
  const w = g.x1 - g.x0 + 1
  const h = g.y1 - g.y0 + 1
  // A 1 is an upright stroke with a short flag at the top: far narrower than the other digits,
  // which are wider than they are tall.
  if (w < h * 0.7) return '1'
  const band = Math.max(1, h * 0.14)
  const side = Math.max(1, w * 0.22)
  const midX0 = g.x0 + w * 0.3
  const midX1 = g.x1 - w * 0.3
  const segments = [
    across(img, g, midX0, midX1, g.y0, g.y0 + band),
    down(img, g, g.x1 - side, g.x1, g.y0 + h * 0.18, g.y0 + h * 0.38),
    down(img, g, g.x1 - side, g.x1, g.y0 + h * 0.62, g.y0 + h * 0.82),
    across(img, g, midX0, midX1, g.y1 - band, g.y1),
    down(img, g, g.x0, g.x0 + side, g.y0 + h * 0.62, g.y0 + h * 0.82),
    down(img, g, g.x0, g.x0 + side, g.y0 + h * 0.18, g.y0 + h * 0.38),
    across(img, g, midX0, midX1, g.y0 + h * 0.4, g.y0 + h * 0.6)
  ]
  return DIGITS[segments.map((s) => (s >= LIT ? '1' : '0')).join('')] ?? null
}

// The glyphs that are digits, with the tallest's height: shorter ones are a colon or a plus.
function split(found: Glyph[]): { tall: number; digits: Glyph[]; small: Glyph[] } {
  const tall = Math.max(0, ...found.map((g) => g.y1 - g.y0 + 1))
  const isDigit = (g: Glyph): boolean => g.y1 - g.y0 + 1 >= tall * 0.8
  return { tall, digits: found.filter(isDigit), small: found.filter((g) => !isDigit(g)) }
}

function score(img: BgraImage, part: Part): number | null {
  const { tall, digits, small } = split(glyphs(img, place(img, part)))
  // Too small to be a digit at this size: nothing readable is in the box.
  if (tall < img.height * 0.35 || digits.length === 0 || digits.length > 2 || small.length > 0)
    return null
  const text = digits.map((g) => digit(img, g)).join('')
  return /^\d{1,2}$/.test(text) ? Number(text) : null
}

function clock(img: BgraImage): { seconds: number | null; overtime: boolean } {
  const { tall, digits, small } = split(glyphs(img, place(img, CLOCK)))
  const unknown = { seconds: null, overtime: false }
  if (tall < img.height * 0.25 || digits.length < 3 || digits.length > 4) return unknown
  // The colon: narrow, between the minutes and the two digits of seconds.
  const narrow = (g: Glyph): boolean => g.x1 - g.x0 + 1 < tall * 0.25
  const colon = small.find((g) => narrow(g) && g.x0 > digits[digits.length - 3].x1)
  if (!colon) return unknown
  // A plus before the minutes: wider than the colon.
  const overtime = small.some((g) => !narrow(g) && g.x1 < digits[0].x0)
  const minutes = digits.filter((g) => g.x1 < colon.x0)
  const seconds = digits.filter((g) => g.x0 > colon.x1)
  if (seconds.length !== 2 || minutes.length < 1) return unknown
  const m = minutes.map((g) => digit(img, g)).join('')
  const s = seconds.map((g) => digit(img, g)).join('')
  if (!/^\d{1,2}$/.test(m) || !/^\d{2}$/.test(s) || Number(s) > 59) return unknown
  return { seconds: Number(m) * 60 + Number(s), overtime }
}

export function readScoreboard(strip: BgraImage): Scoreboard {
  if (strip.width < 20 || strip.height < 10) {
    return { own: null, other: null, seconds: null, overtime: false }
  }
  return {
    own: score(strip, OWN_SCORE),
    other: score(strip, OTHER_SCORE),
    ...clock(strip)
  }
}
