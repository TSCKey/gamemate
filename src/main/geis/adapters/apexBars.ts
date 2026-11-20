// Apex Legends' health and shield bars in the bottom-left corner, by their colours: no text
// reading, a few thousand pixels a look.
// - The player's card: a white health bar, and above it the shield in the armour's colour (white,
//   blue, purple, red; gold counts as red). Both bars are drawn on one scale: the full width is a
//   red armour's 125 shield, so a full blue armour (75) fills 60% of it. Health is the white run
//   from the left end.
// - Each teammate's card above it: the same bars, smaller. A knocked teammate's health bar is red;
//   an eliminated teammate's card shows green text ("DEATHBOX RECOVERY", "DELIVER TO BEACON")
//   where the bars were.
// Measured on the owner's clips at 1080p (720p recordings scaled up); other sizes are scaled by the
// game's height from its bottom-left corner, where the HUD is anchored. A bar that can't be read
// (a menu, a death box open, the player knocked) is null, never a guess.
import type { Box } from '../../companion/hudAreas'

export interface BgraImage {
  width: number
  height: number
  data: Uint8Array
}

export interface PlayerBars {
  // 0-100: share of full health.
  health: number
  // 0-125: shield points, from the bar's length on the shared scale; null when it couldn't be read.
  shield: number | null
  // The armour's colour, which says how much shield it holds when full.
  armour: Armour | null
}

export type Armour = 'white' | 'blue' | 'purple' | 'red'
export type TeammateState = 'alive' | 'knocked' | 'eliminated'

// Shield points each armour holds when full.
export const ARMOUR_SHIELD: Record<Armour, number> = { white: 50, blue: 75, purple: 100, red: 125 }

// The region read, at 1080p: from 130 to 430 across, 800 to 1025 down.
const REGION = { left: 130, top: 800, width: 300, height: 225 }
// The player's bars, inside the region.
const PLAYER = { left: 48, right: 282, health: [211, 216], shield: [199, 204] }
// Teammates' bars, nearest the player's card first, 66 pixels apart.
const TEAMMATE = { left: 12, right: 165, health: [85, 90], shield: [79, 82], step: 66, slots: 2 }
// A column belongs to a bar when this share of its rows is the bar's colour.
const COLUMN = 0.4
// A bar ends after this many columns without its colour (a segment gap is narrower).
const END_GAP = 4

export function apexHudBox(frame: Box): Box {
  const scale = frame.height / 1080
  return {
    x: Math.max(0, Math.round(frame.x + REGION.left * scale)),
    y: Math.max(0, Math.round(frame.y + frame.height - (1080 - REGION.top) * scale)),
    width: Math.max(1, Math.round(REGION.width * scale)),
    height: Math.max(1, Math.round(REGION.height * scale))
  }
}

type Rgb = [number, number, number]
type Test = (rgb: Rgb) => boolean

const white: Test = ([r, g, b]) => Math.min(r, g, b) > 200
const red: Test = ([r, g, b]) => r > 170 && g < 90 && b < 90
const green: Test = ([r, g, b]) => g > 150 && r < 170 && b < 120 && g - b > 50
const ARMOUR_TEST: [Armour, Test][] = [
  ['blue', ([r, , b]) => b > 150 && b > r + 60],
  ['purple', ([r, g, b]) => r > 120 && b > 120 && g < 100],
  ['red', ([r, g, b]) => r > 170 && g < 110 && b < 90],
  // Gold armour reads as red: the same 125.
  ['red', ([r, g, b]) => r > 200 && g > 150 && b < 80],
  ['white', ([r, g, b]) => Math.min(r, g, b) > 225]
]
const armourOf = (rgb: Rgb): Armour | null => ARMOUR_TEST.find(([, test]) => test(rgb))?.[0] ?? null

class Pixels {
  private readonly scale: number
  constructor(private readonly image: BgraImage) {
    this.scale = image.height / REGION.height
  }

  at(x: number, y: number): Rgb {
    const px = Math.min(this.image.width - 1, Math.max(0, Math.round(x * this.scale)))
    const py = Math.min(this.image.height - 1, Math.max(0, Math.round(y * this.scale)))
    const i = (py * this.image.width + px) * 4
    return [this.image.data[i + 2], this.image.data[i + 1], this.image.data[i]]
  }

  // Whether column x is the bar's colour across rows [top, bottom).
  column(x: number, [top, bottom]: number[], test: Test): boolean {
    let hits = 0
    for (let y = top; y < bottom; y++) if (test(this.at(x, y))) hits++
    return hits / (bottom - top) >= COLUMN
  }

  // How far the bar runs from the left end, as a share of its full width.
  run(left: number, right: number, rows: number[], test: Test): number {
    let end = left
    let gap = 0
    for (let x = left; x <= right; x++) {
      if (this.column(x, rows, test)) {
        end = x + 1
        gap = 0
      } else if (++gap > END_GAP) break
    }
    return (end - left) / (right - left)
  }

  share(left: number, right: number, [top, bottom]: number[], test: Test): number {
    let hits = 0
    let total = 0
    for (let y = top; y < bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (test(this.at(x, y))) hits++
        total++
      }
    }
    return total ? hits / total : 0
  }
}

export function readPlayerBars(image: BgraImage): PlayerBars | null {
  const px = new Pixels(image)
  // The health bar's left end has to be there, or it isn't the card (menus, the player knocked).
  const start = [0, 1, 2, 3, 4].every((d) =>
    px.column(PLAYER.left + d, PLAYER.health, (rgb) => white(rgb) || red(rgb))
  )
  if (!start) return null
  const health = px.run(PLAYER.left, PLAYER.right, PLAYER.health, (rgb) => white(rgb) || red(rgb))
  // The shield's colour, from its first columns.
  let armour: Armour | null = null
  for (let x = PLAYER.left; x < PLAYER.left + 10 && !armour; x++) {
    armour = armourOf(px.at(x, (PLAYER.shield[0] + PLAYER.shield[1]) / 2))
  }
  const shield = armour
    ? px.run(PLAYER.left, PLAYER.right, PLAYER.shield, (rgb) => armourOf(rgb) === armour)
    : 0
  const points = Math.round(Math.min(1, shield) * ARMOUR_SHIELD.red)
  // More shield than the armour holds, or a sliver of its colour, is a misreading (the owner's
  // live 1080p game read "98" for a blue armour and "1" for a full purple one): no shield
  // reading then, rather than a wrong one.
  const readable = !armour || (points <= ARMOUR_SHIELD[armour] + 5 && points >= 3)
  return {
    health: Math.round(Math.min(1, health) * 100),
    shield: readable ? (armour ? points : 0) : null,
    armour: readable ? armour : null
  }
}

// Teammates' states, nearest the player's card first; null for a slot that shows none of them
// (no teammate there in duos, or it can't be told).
export function readTeammates(image: BgraImage): (TeammateState | null)[] {
  const px = new Pixels(image)
  return Array.from({ length: TEAMMATE.slots }, (_, slot) => {
    const shift = -TEAMMATE.step * slot
    const rows = TEAMMATE.health.map((y) => y + shift)
    const { left, right } = TEAMMATE
    if (px.share(left, right, rows, red) > 0.5) return 'knocked'
    if (px.run(left, right, rows, white) > 0.05 && px.column(left + 1, rows, white)) return 'alive'
    // The green text sits where the bars were.
    const card = [rows[0] - 8, rows[1] + 4]
    if (px.share(left, right + 30, card, green) > 0.04) return 'eliminated'
    return null
  })
}
