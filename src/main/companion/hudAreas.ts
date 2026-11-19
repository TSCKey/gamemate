// Which parts of a game's screen say what happened in the match: its kill feed and its banners.
// In these games the vision model sees only these parts, never the map or the area around the
// crosshair, so it can't know where anyone is.
//
// Positions are the games' default layouts, as fractions of the game window. A player who moved
// their HUD will get fewer reactions, nothing worse.

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Area extends Box {
  kind: 'feed' | 'banner'
}

const feed = (x: number, y: number, width: number, height: number): Area => ({
  kind: 'feed',
  x,
  y,
  width,
  height
})

// Round results, victory screens and the like.
const TOP_BANNER: Area = { kind: 'banner', x: 0.25, y: 0.16, width: 0.5, height: 0.16 }
// League's announcer text sits higher, and nothing else shares that strip.
const LEAGUE_BANNER: Area = { kind: 'banner', x: 0.25, y: 0.1, width: 0.5, height: 0.14 }
// "Eliminated <name>" and similar, shown below the crosshair.
const LOW_BANNER: Area = { kind: 'banner', x: 0.25, y: 0.62, width: 0.5, height: 0.16 }

// `readText`: the kill feed's lines read "name, weapon, name" and were checked with the text
// reader (src/main/ocr) on the owner's recordings, so its text can be read without the vision
// model. Only VALORANT so far: 12 clips, 97% of 279 names read exactly.
const LAYOUTS: { name: RegExp; areas: Area[]; readText?: true }[] = [
  { name: /^valorant$/i, areas: [feed(0.7, 0.06, 0.3, 0.32), TOP_BANNER], readText: true },
  { name: /^overwatch/i, areas: [feed(0.68, 0.02, 0.32, 0.3), TOP_BANNER, LOW_BANNER] },
  { name: /^marvel rivals$/i, areas: [feed(0.7, 0.05, 0.3, 0.3), TOP_BANNER, LOW_BANNER] },
  { name: /^counter-strike/i, areas: [feed(0.72, 0.05, 0.28, 0.3), TOP_BANNER] },
  { name: /^league of legends$/i, areas: [feed(0.8, 0.18, 0.2, 0.4), LEAGUE_BANNER] },
  { name: /^apex legends$/i, areas: [feed(0.7, 0.06, 0.3, 0.3), LOW_BANNER] },
  { name: /^fortnite$/i, areas: [feed(0, 0.5, 0.3, 0.28), LOW_BANNER] },
  {
    name: /^(rainbow six|tom clancy's rainbow six)/i,
    areas: [feed(0.7, 0.12, 0.3, 0.3), TOP_BANNER]
  },
  { name: /^rocket league$/i, areas: [feed(0.72, 0.02, 0.28, 0.2), TOP_BANNER] },
  { name: /^dota 2$/i, areas: [feed(0, 0.18, 0.22, 0.4), TOP_BANNER] }
]

// The parts to watch in this game, or null to look at the whole screen as usual.
export function hudAreas(gameName: string): Area[] | null {
  return LAYOUTS.find((layout) => layout.name.test(gameName))?.areas ?? null
}

// Whether this game's feed and banners can be read by the text reader instead of the vision model.
export function readsText(gameName: string): boolean {
  return LAYOUTS.find((layout) => layout.name.test(gameName))?.readText === true
}

// Where the game's window is inside a capture of its display, in the capture's own pixels.
export function gameFrame(
  window: Box | null,
  display: Box,
  image: { width: number; height: number }
): Box {
  if (!window) return { x: 0, y: 0, width: image.width, height: image.height }
  const scale = image.width / display.width
  const left = Math.max(0, Math.round((window.x - display.x) * scale))
  const top = Math.max(0, Math.round((window.y - display.y) * scale))
  const right = Math.min(image.width, Math.round((window.x + window.width - display.x) * scale))
  const bottom = Math.min(image.height, Math.round((window.y + window.height - display.y) * scale))
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

// The whole-pixel rectangle of one area, always inside the capture and never empty.
export function cropBox(area: Area, frame: Box, image: { width: number; height: number }): Box {
  const x = Math.min(image.width - 1, Math.round(frame.x + area.x * frame.width))
  const y = Math.min(image.height - 1, Math.round(frame.y + area.y * frame.height))
  return {
    x,
    y,
    width: Math.max(1, Math.min(image.width - x, Math.round(area.width * frame.width))),
    height: Math.max(1, Math.min(image.height - y, Math.round(area.height * frame.height)))
  }
}
