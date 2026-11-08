import { describe, expect, it } from 'vitest'
import { cropBox, gameFrame, hudAreas, type Area, type Box } from '../src/main/companion/hudAreas'

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// Where each game's map sits by default, as fractions of the screen.
const MAPS: [string, Box][] = [
  ['VALORANT', { x: 0, y: 0, width: 0.22, height: 0.38 }],
  ['Counter-Strike 2', { x: 0, y: 0, width: 0.2, height: 0.36 }],
  ['League of Legends', { x: 0.82, y: 0.7, width: 0.18, height: 0.3 }],
  ['Apex Legends', { x: 0, y: 0, width: 0.2, height: 0.34 }],
  ['Fortnite', { x: 0.84, y: 0, width: 0.16, height: 0.3 }],
  ["Tom Clancy's Rainbow Six Siege", { x: 0, y: 0, width: 0.18, height: 0.32 }],
  ['Dota 2', { x: 0, y: 0.72, width: 0.2, height: 0.28 }]
]

const KNOWN = [...MAPS.map(([name]) => name), 'Overwatch 2', 'Marvel Rivals', 'Rocket League']

const areasOf = (name: string): Area[] => hudAreas(name) ?? []

describe('the parts of the screen GameMate watches', () => {
  it.each(KNOWN)('are known for %s', (name) => {
    expect(areasOf(name).length).toBeGreaterThan(0)
  })

  it.each(KNOWN)('include where %s shows its feed', (name) => {
    expect(areasOf(name).some((a) => a.kind === 'feed')).toBe(true)
  })

  it.each(KNOWN)('stay on the screen in %s', (name) => {
    for (const a of areasOf(name)) {
      expect(a.x).toBeGreaterThanOrEqual(0)
      expect(a.y).toBeGreaterThanOrEqual(0)
      expect(a.x + a.width).toBeLessThanOrEqual(1)
      expect(a.y + a.height).toBeLessThanOrEqual(1)
    }
  })

  // What is around the crosshair is where enemies are: GameMate has no business seeing it.
  it.each(KNOWN)('never include the middle of the screen in %s', (name) => {
    const middle = { x: 0.36, y: 0.36, width: 0.28, height: 0.24 }
    for (const a of areasOf(name)) expect(overlap(a, middle), a.kind).toBe(false)
  })

  it.each(MAPS)('never include the map in %s', (name, map) => {
    for (const a of areasOf(name)) expect(overlap(a, map), a.kind).toBe(false)
  })

  it.each(KNOWN)('cover well under half of the screen in %s', (name) => {
    const covered = areasOf(name).reduce((sum, a) => sum + a.width * a.height, 0)
    expect(covered).toBeLessThan(0.35)
  })

  it('are not guessed for games without a feed or a known layout', () => {
    expect(hudAreas('Minecraft')).toBeNull()
    expect(hudAreas('Terraria')).toBeNull()
    expect(hudAreas('Brawlhalla')).toBeNull()
  })

  it('go by the whole name of the game', () => {
    expect(hudAreas('League of Legends: Wild Rift')).toBeNull()
    expect(hudAreas('Rocket League Sideswipe')).toBeNull()
  })
})

describe('finding those parts in a capture', () => {
  const image = { width: 1920, height: 1080 }
  const display = { x: 0, y: 0, width: 1920, height: 1080 }
  const area: Area = { kind: 'feed', x: 0.75, y: 0.1, width: 0.25, height: 0.2 }

  it('uses the whole capture when the window is unknown', () => {
    expect(gameFrame(null, display, image)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('finds a window that does not fill the screen', () => {
    const window = { x: 320, y: 180, width: 1280, height: 720 }
    expect(gameFrame(window, display, image)).toEqual({ x: 320, y: 180, width: 1280, height: 720 })
  })

  it('allows for a capture smaller than the screen', () => {
    const big = { x: 0, y: 0, width: 3840, height: 2160 }
    const window = { x: 1920, y: 0, width: 1920, height: 1080 }
    expect(gameFrame(window, big, image)).toEqual({ x: 960, y: 0, width: 960, height: 540 })
  })

  it('allows for a display that is not the first one', () => {
    const second = { x: 1920, y: -200, width: 1920, height: 1080 }
    const window = { x: 1920, y: -200, width: 1920, height: 1080 }
    expect(gameFrame(window, second, image)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('keeps a window hanging off the screen inside the capture', () => {
    const window = { x: -100, y: 900, width: 2200, height: 400 }
    expect(gameFrame(window, display, image)).toEqual({ x: 0, y: 900, width: 1920, height: 180 })
  })

  it('cuts an area out in whole pixels', () => {
    expect(cropBox(area, { x: 0, y: 0, width: 1920, height: 1080 }, image)).toEqual({
      x: 1440,
      y: 108,
      width: 480,
      height: 216
    })
  })

  it('cuts relative to the window', () => {
    expect(cropBox(area, { x: 320, y: 180, width: 1280, height: 720 }, image)).toEqual({
      x: 1280,
      y: 252,
      width: 320,
      height: 144
    })
  })

  it('never cuts outside the capture or to nothing', () => {
    const box = cropBox(area, { x: 1919, y: 1079, width: 1, height: 1 }, image)
    expect(box.width).toBeGreaterThanOrEqual(1)
    expect(box.height).toBeGreaterThanOrEqual(1)
    expect(box.x + box.width).toBeLessThanOrEqual(1920)
    expect(box.y + box.height).toBeLessThanOrEqual(1080)
  })
})
