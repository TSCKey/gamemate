// How many of the player's team are still alive in VALORANT, from the bar at the top of the
// screen: it shows a portrait for each player still alive, the player's own team left of the
// timer, and under each of the team's portraits a health bar that is white (red where health was
// lost). Dead players' portraits go, and the rest move up to the timer. Counting those health bars
// is a light pixel check, no model and no text reading.
//
// Measured on the owner's 12 VALORANT clips (7 at 1080p, 5 at 720p): the default HUD, at
// 1920x1080 sizes, scaled by the game's height for other sizes. A moved or scaled HUD reads as
// unknown, never as a count.
import type { Box } from '../../companion/hudAreas'

export interface BgraImage {
  width: number
  height: number
  // Blue, green, red, alpha for each pixel, row by row.
  data: Uint8Array
}

export const TEAM_SIZE = 5
// At 1080p: the health bar nearest the timer is centred 230.5 px left of the screen's middle, the
// next ones 65.5 px apart, each about 42 px wide, on rows 77 to 81.
const NEAREST = 230.5
const SPACING = 65.5
const HALF_WIDTH = 17
const BAR_TOP = 77
const BAR_BOTTOM = 82
// Just above and below the bar: a white wall or a flash there means the bar can't be told apart.
const ABOVE = [72, 74]
const BELOW = [85, 87]
const REGION_TOP = 70
const REGION_BOTTOM = 90
const REGION_LEFT = NEAREST + SPACING * (TEAM_SIZE - 1) + HALF_WIDTH + 4
const REGION_RIGHT = NEAREST - HALF_WIDTH - 4
// Health fills a bar from its left end: where a teammate is alive, most of that end is white, or
// bright red when little health is left. Lost health is grey, and a wall behind an empty slot
// can be any colour, salmon and light grey included.
const LEFT_END = 6
const FILLED = 0.5
const SURROUNDED = 0.3

// Where to cut the bar out of a capture, given where the game's picture is in it.
export function teamBarBox(frame: Box): Box {
  const scale = frame.height / 1080
  const middle = frame.x + frame.width / 2
  return {
    x: Math.max(0, Math.round(middle - REGION_LEFT * scale)),
    y: Math.max(0, Math.round(frame.y + REGION_TOP * scale)),
    width: Math.max(1, Math.round((REGION_LEFT - REGION_RIGHT) * scale)),
    height: Math.max(1, Math.round((REGION_BOTTOM - REGION_TOP) * scale))
  }
}

// The number of the player's team still alive, 1 to 5, or null when the bar can't be read (a
// flash, the buy phase's grey bars, a menu).
export function teammatesAlive(bar: BgraImage): number | null {
  const scale = bar.height / (REGION_BOTTOM - REGION_TOP)
  const at = (x: number, y: number): [number, number, number] => {
    const i = (Math.min(bar.height - 1, y) * bar.width + Math.min(bar.width - 1, x)) * 4
    return [bar.data[i + 2], bar.data[i + 1], bar.data[i]]
  }
  const share = (
    centre: number,
    top: number,
    bottom: number,
    test: (r: number, g: number, b: number) => boolean,
    width = 2 * HALF_WIDTH
  ): number => {
    const x0 = Math.round(centre - HALF_WIDTH * scale)
    const x1 = Math.round(centre + (width - HALF_WIDTH) * scale)
    const y0 = Math.round((top - REGION_TOP) * scale)
    const y1 = Math.max(y0 + 1, Math.round((bottom - REGION_TOP) * scale))
    let hits = 0
    let total = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const [r, g, b] = at(x, y)
        if (test(r, g, b)) hits++
        total++
      }
    }
    return total ? hits / total : 0
  }
  const white = (r: number, g: number, b: number): boolean => Math.min(r, g, b) > 190
  const red = (r: number, g: number, b: number): boolean => r > 170 && g < 110 && b < 110
  const alive = (slot: number): boolean => {
    const centre = (REGION_LEFT - NEAREST - SPACING * slot) * scale
    const filled = share(
      centre,
      BAR_TOP,
      BAR_BOTTOM,
      (r, g, b) => white(r, g, b) || red(r, g, b),
      LEFT_END
    )
    return (
      filled > FILLED &&
      share(centre, ABOVE[0], ABOVE[1], white) < SURROUNDED &&
      share(centre, BELOW[0], BELOW[1], white) < SURROUNDED
    )
  }
  let count = 0
  while (count < TEAM_SIZE && alive(count)) count++
  return count === 0 ? null : count
}
