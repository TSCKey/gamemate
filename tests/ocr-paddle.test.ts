// GameMate's kill-feed text reader: the PaddleOCR steps around its models, turning what it read
// into feed lines, and those into kills and deaths. The models themselves were checked on the
// owner's 12 VALORANT clips (97% of 279 names read exactly); here they are stand-ins.
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  ctcDecode,
  ctcTable,
  detectionSize,
  PADDLE_DETECT,
  readImage,
  textBoxes,
  yamlCharacters,
  type OcrModel,
  type OcrSegment
} from '../src/main/ocr/paddleOcr'
import { bannerParts, feedLines } from '../src/main/ocr/feedText'
import { readAreas } from '../src/main/companion/areaReading'
import { hudAreas, readsText } from '../src/main/companion/hudAreas'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))
vi.mock('koffi', () => ({ default: {} }))
await import('../src/main/system/settings')
const { readAreasText } = await import('../src/main/geis/adapters/killfeed')
const { KILLFEED_OCR_ID, isLocalModelId, isCatalogModelId, localModelStatuses } =
  await import('../src/main/ai/localModels')

const seg = (text: string, x: number, y: number, width = 80, height = 20): OcrSegment => ({
  text,
  score: 0.95,
  x,
  y,
  width,
  height
})

describe('the character list in PaddleOCR’s model settings', () => {
  it('reads every quoting YAML uses', () => {
    const yaml = [
      'PostProcess:',
      '  name: CTCLabelDecode',
      '  character_dict:',
      "  - '!'",
      "  - ''''",
      '  - "\\u00E4"',
      '  - A',
      '  - 0',
      '  - 青',
      'Other: 1'
    ].join('\n')
    expect(yamlCharacters(yaml)).toEqual(['!', "'", 'ä', 'A', '0', '青'])
  })

  it('puts the blank first and a space last, as the model counts them', () => {
    expect(ctcTable(['a', 'b'])).toEqual(['', 'a', 'b', ' '])
  })
})

describe('reading the characters off the model’s output', () => {
  // Steps of [blank, a, b, space] chances.
  const steps = (...best: number[]): Float32Array =>
    Float32Array.from(best.flatMap((b) => [0, 1, 2, 3].map((c) => (c === b ? 0.9 : 0.03))))
  const table = ctcTable(['a', 'b'])

  it('drops repeats and blanks, and keeps a letter that comes again after a blank', () => {
    const out = ctcDecode(steps(1, 1, 0, 1, 2, 2, 3, 2), 8, 4, 0, table)
    expect(out.text).toBe('aab b')
    expect(out.score).toBeCloseTo(0.9)
  })

  it('reads one item of a batch by its offset', () => {
    const batch = Float32Array.from([...steps(1, 0), ...steps(2, 0)])
    expect(ctcDecode(batch, 2, 4, 8, table).text).toBe('b')
  })
})

describe('finding the text', () => {
  it('scales a small kill-feed crop up to 736 px on its shorter side, in steps of 32', () => {
    // A 1080p VALORANT feed crop, and a 720p one.
    expect(detectionSize(576, 346)).toEqual({ width: 1216, height: 736 })
    expect(detectionSize(384, 230)).toEqual({ width: 1216, height: 736 })
    expect(detectionSize(2000, 1000)).toEqual({ width: 2016, height: 992 })
  })

  it('finds each patch of text as a box, top to bottom and left to right', () => {
    const [w, h] = [100, 40]
    const map = new Float32Array(w * h)
    const fill = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) map[y * w + x] = 0.9
    }
    fill(60, 5, 90, 12)
    fill(5, 6, 30, 13)
    fill(10, 25, 40, 33)
    // A speck is no text.
    fill(50, 30, 51, 31)
    const boxes = textBoxes(map, w, h, 200, 80, PADDLE_DETECT)
    expect(boxes.map((b) => Math.round(b.x / 20))).toEqual([0, 6, 1])
    expect(boxes).toHaveLength(3)
    // Grown beyond the patch, as PaddleOCR's "unclip" does, and scaled to the image.
    expect(boxes[1].x).toBeLessThan(120)
    expect(boxes[1].x + boxes[1].width).toBeGreaterThan(182)
  })

  it('reads each box it finds and keeps only what it is sure of', async () => {
    const image = { width: 64, height: 32, data: new Uint8Array(64 * 32 * 4) }
    const detect: OcrModel = {
      run: async (_data, dims) => {
        const [, , hh, ww] = dims
        const map = new Float32Array(hh * ww)
        for (let y = 200; y < 400; y++) for (let x = 100; x < 1000; x++) map[y * ww + x] = 0.9
        return { data: map, dims: [1, 1, hh, ww] }
      }
    }
    let shape: number[] = []
    const recognize: OcrModel = {
      run: async (_data, dims) => {
        shape = dims
        // "ab" at high confidence.
        const out = new Float32Array(3 * 4).fill(0.01)
        out[1] = 0.97
        out[4 + 2] = 0.97
        out[8] = 0.97
        return { data: out, dims: [1, 3, 4] }
      }
    }
    const read = await readImage(image, { detect, recognize, table: ctcTable(['a', 'b']) })
    expect(read.map((s) => s.text)).toEqual(['ab'])
    expect(shape.slice(0, 3)).toEqual([1, 3, 48])
  })
})

describe('kill-feed lines from what was read', () => {
  it('splits each line where the weapon is, the widest gap', () => {
    const lines = feedLines([
      seg('TSCKey', 120, 30),
      seg('angy323', 420, 32),
      seg('Hakon', 20, 70, 50),
      seg('Le Bon', 74, 71, 50),
      seg('Oddishly', 340, 70)
    ])
    expect(lines).toEqual([
      { left: 'TSCKey', right: 'angy323' },
      { left: 'Hakon Le Bon', right: 'Oddishly' }
    ])
  })

  it('leaves out rank numerals and icon edges, and lines with only one name', () => {
    expect(
      feedLines([seg('IV', 10, 30, 15), seg('TSCKey', 40, 30), seg('Jett', 300, 80, 40)])
    ).toEqual([])
  })

  it('reads a banner’s big words apart from the line under them', () => {
    expect(bannerParts([seg('GEWONNEN', 200, 40), seg('RUNDE', 80, 41)])).toEqual({
      headline: 'RUNDE GEWONNEN',
      below: ''
    })
    // As in the owner's clips.
    expect(
      bannerParts([
        seg('GEWONNEN', 319, 0, 322, 64),
        seg('GEGNERISCHES TEAM ELIMINIERT', 328, 83, 305, 18)
      ])
    ).toEqual({ headline: 'GEWONNEN', below: 'GEGNERISCHES TEAM ELIMINIERT' })
    expect(bannerParts([seg('KNAPP', 373, 0, 206, 90), seg('TSCKey', 445, 129, 69, 23)])).toEqual({
      headline: 'KNAPP',
      below: 'TSCKey'
    })
  })
})

describe('the text reader in place of the vision model', () => {
  const areas = hudAreas('VALORANT') ?? []
  const fake = (byImage: OcrSegment[][]) => {
    let i = 0
    return async () => byImage[i++] ?? []
  }

  it('gives the reply the vision model gave, so the same code finds the player’s kills', async () => {
    const reply = await readAreasText(
      areas,
      [{}, {}] as never,
      fake([
        [
          seg('TSCKey', 120, 30),
          seg('angy323', 420, 32),
          seg('Jett', 120, 70),
          seg('TSCKey', 420, 70)
        ],
        [seg('RUNDE', 80, 40), seg('GEWONNEN', 200, 40)]
      ])
    )
    const report = readAreas(reply, 1000, ['TSCKey'])
    expect(report.events.map((e) => [e.type, e.opponent])).toEqual([
      ['round_won', ''],
      ['kill', 'angy323'],
      ['death', 'Jett']
    ])
  })

  it('knows VALORANT’s round banner, and its clutch and ace banners over the player’s name', async () => {
    const banner = async (...pieces: OcrSegment[]): Promise<string[]> => {
      const reply = await readAreasText(areas, [{}, {}] as never, fake([[], pieces]))
      return readAreas(reply, 1000, ['TSCKey']).events.map((e) => e.type)
    }
    expect(
      await banner(
        seg('GEWONNEN', 319, 0, 322, 64),
        seg('GEGNERISCHES TEAM ELIMINIERT', 328, 83, 305, 18)
      )
    ).toEqual(['round_won'])
    expect(await banner(seg('VERLOREN', 319, 0, 322, 64))).toEqual(['round_lost'])
    expect(await banner(seg('KNAPP', 373, 0, 206, 90), seg('TSCKey', 445, 129, 69, 23))).toEqual([
      'clutch',
      'round_won'
    ])
    expect(await banner(seg('ASS', 333, 0, 216, 96), seg('TSCKey', 443, 127, 72, 28))).toEqual([
      'ace',
      'round_won'
    ])
    // A teammate's clutch is still the team's round.
    expect(await banner(seg('KNAPP', 373, 0, 206, 90), seg('Jett', 445, 129, 69, 23))).toEqual([
      'round_won'
    ])
  })

  it('is used only for VALORANT, the feed it was checked on', () => {
    expect(readsText('VALORANT')).toBe(true)
    expect(readsText('Apex Legends')).toBe(false)
    expect(readsText('Overwatch 2')).toBe(false)
  })
})

describe('the kill-feed reader in the model list', () => {
  it('is a download of its own that never becomes the main model', () => {
    expect(isCatalogModelId(KILLFEED_OCR_ID)).toBe(true)
    expect(isLocalModelId(KILLFEED_OCR_ID)).toBe(false)
    const reader = localModelStatuses().find((m) => m.id === KILLFEED_OCR_ID)
    expect(reader?.job).toBe('killfeed')
    // Detection, recognition and its character list.
    expect(reader?.sizeMb).toBe(31)
  })
})
