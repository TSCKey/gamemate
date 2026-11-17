import { describe, expect, it } from 'vitest'
import type { Box, Frame } from '../src/shared/screen/frame'
import { SILKSONG_LAYOUT, isBlackFrame, measureSilksong } from '../src/shared/screen/silksong'

type Rgb = [number, number, number]

function solid(width: number, height: number, rgb: Rgb): Frame {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}

function paint(frame: Frame, box: Box, rgb: Rgb): void {
  const x0 = Math.round(box.x * frame.width)
  const y0 = Math.round(box.y * frame.height)
  const x1 = Math.round((box.x + box.width) * frame.width)
  const y1 = Math.round((box.y + box.height) * frame.height)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * frame.width + x) * 4
      frame.data[i] = rgb[0]
      frame.data[i + 1] = rgb[1]
      frame.data[i + 2] = rgb[2]
    }
  }
}

// White vertical stripes (two pixels wide) inside the box, on whatever is already there.
function paintStripes(frame: Frame, box: Box): void {
  const x0 = Math.round(box.x * frame.width)
  const y0 = Math.round(box.y * frame.height)
  const x1 = Math.round((box.x + box.width) * frame.width)
  const y1 = Math.round((box.y + box.height) * frame.height)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x % 4 < 2) {
        const i = (y * frame.width + x) * 4
        frame.data[i] = frame.data[i + 1] = frame.data[i + 2] = 255
      }
    }
  }
}

// Finds a colour the layout counts as a filled mask, so tests do not hard-code one.
function filledColour(): Rgb {
  for (const rgb of [
    [255, 255, 255],
    [240, 240, 240],
    [200, 200, 200],
    [255, 255, 0]
  ] as Rgb[]) {
    if (SILKSONG_LAYOUT.maskFilled(rgb[0], rgb[1], rgb[2])) return rgb
  }
  throw new Error('no test colour counts as a filled mask')
}

describe('measureSilksong', () => {
  for (const [w, h] of [
    [480, 270],
    [1280, 720]
  ]) {
    it(`counts the filled masks at ${w}x${h}`, () => {
      const frame = solid(w, h, [0, 0, 0])
      for (const mask of SILKSONG_LAYOUT.masks.slice(0, 3)) paint(frame, mask, filledColour())
      expect(measureSilksong(frame).masks).toBe(3)
    })
  }

  it('sees text in the area title box but not the boss title box', () => {
    const frame = solid(480, 270, [0, 0, 0])
    paintStripes(frame, SILKSONG_LAYOUT.areaTitle)
    const m = measureSilksong(frame)
    expect(m.areaText).toBeGreaterThan(0.3)
    expect(m.bossText).toBeLessThan(0.05)
  })

  it('sees text in the boss title box but not the area title box', () => {
    const frame = solid(480, 270, [0, 0, 0])
    paintStripes(frame, SILKSONG_LAYOUT.bossTitle)
    const m = measureSilksong(frame)
    expect(m.bossText).toBeGreaterThan(0.3)
    expect(m.areaText).toBeLessThan(0.05)
  })

  it('sees text in the pickup box', () => {
    const frame = solid(480, 270, [0, 0, 0])
    paintStripes(frame, SILKSONG_LAYOUT.pickup)
    expect(measureSilksong(frame).pickupText).toBeGreaterThan(0.3)
  })
})

describe('isBlackFrame', () => {
  it('is true for an all-black frame', () => {
    expect(isBlackFrame(measureSilksong(solid(480, 270, [0, 0, 0])))).toBe(true)
  })

  it('is false for a lit frame', () => {
    expect(isBlackFrame(measureSilksong(solid(480, 270, [120, 120, 120])))).toBe(false)
  })
})
