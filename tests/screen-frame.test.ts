import { describe, expect, it } from 'vitest'
import {
  brightTextScore,
  colourShare,
  meanBrightness,
  type Box,
  type Frame
} from '../src/shared/screen/frame'

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

// White vertical stripes on black, two pixels wide at any frame size.
function stripes(width: number, height: number): Frame {
  const frame = solid(width, height, [0, 0, 0])
  const period = 4
  const stripe = 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x % period < stripe) {
        const i = (y * width + x) * 4
        frame.data[i] = frame.data[i + 1] = frame.data[i + 2] = 255
      }
    }
  }
  return frame
}

const box: Box = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }

describe('meanBrightness', () => {
  it('is 0 for a black frame and 1 for a white one', () => {
    expect(meanBrightness(solid(480, 270, [0, 0, 0]))).toBe(0)
    expect(meanBrightness(solid(480, 270, [255, 255, 255]))).toBeCloseTo(1, 5)
  })

  it('measures only the given box', () => {
    const frame = solid(480, 270, [0, 0, 0])
    paint(frame, { x: 0.5, y: 0, width: 0.5, height: 1 }, [255, 255, 255])
    expect(meanBrightness(frame, { x: 0, y: 0, width: 0.5, height: 1 })).toBe(0)
  })
})

describe('brightTextScore', () => {
  it('scores a pattern of bright stripes on black as text-like', () => {
    expect(brightTextScore(stripes(480, 270), box, 0.6)).toBeGreaterThan(0.3)
  })

  it('scores a plain white box as not text-like', () => {
    expect(brightTextScore(solid(480, 270, [255, 255, 255]), box, 0.6)).toBeLessThan(0.05)
  })

  it('scores a black box as 0', () => {
    expect(brightTextScore(solid(480, 270, [0, 0, 0]), box, 0.6)).toBe(0)
  })

  it('gives the same score at a larger frame size', () => {
    const small = brightTextScore(stripes(480, 270), box, 0.6)
    const large = brightTextScore(stripes(960, 540), box, 0.6)
    expect(Math.abs(small - large)).toBeLessThanOrEqual(0.05)
  })
})

describe('colourShare', () => {
  it('is the share of pixels in the box that pass the test', () => {
    const frame = solid(480, 270, [0, 0, 0])
    paint(frame, { x: 0.25, y: 0.25, width: 0.25, height: 0.5 }, [255, 0, 0])
    expect(colourShare(frame, box, (r, g) => r > 200 && g < 60)).toBeCloseTo(0.5, 2)
  })
})
