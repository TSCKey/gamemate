// Turns the text PaddleOCR found in a kill feed and a banner into what the vision model used to
// copy from them (see areaPrompt in geis/adapters/killfeed.ts), so the same code decides what
// they mean. For feeds whose lines read "name, weapon, name", as VALORANT's do.
import type { OcrSegment } from './paddleOcr'

export interface FeedLine {
  left: string
  right: string
}

// Rank numerals and icon edges come out as one or two characters; VALORANT names have at least
// three.
const MIN_NAME = 3

const middle = (s: OcrSegment): number => s.y + s.height / 2

// Pieces of text on one line, left to right.
function lines(segments: OcrSegment[]): OcrSegment[][] {
  const rows: OcrSegment[][] = []
  for (const segment of [...segments].sort((a, b) => middle(a) - middle(b))) {
    const row = rows.at(-1)
    const tall = row ? Math.max(segment.height, ...row.map((s) => s.height)) : 0
    if (row && Math.abs(middle(segment) - middle(row[0])) < tall / 2) row.push(segment)
    else rows.push([segment])
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x))
}

// One entry per feed line with a name on each side of the weapon: the widest gap between pieces
// of text is where the weapon is.
export function feedLines(segments: OcrSegment[]): FeedLine[] {
  return lines(segments.filter((s) => s.text.trim().length >= MIN_NAME)).flatMap((row) => {
    if (row.length < 2) return []
    let split = 1
    let widest = -Infinity
    for (let i = 1; i < row.length; i++) {
      const gap = row[i].x - (row[i - 1].x + row[i - 1].width)
      if (gap > widest) {
        widest = gap
        split = i
      }
    }
    const join = (part: OcrSegment[]): string => part.map((s) => s.text.trim()).join(' ')
    return [{ left: join(row.slice(0, split)), right: join(row.slice(split)) }]
  })
}

export interface Banner {
  // The big words, such as "GEWONNEN" or "KNAPP".
  headline: string
  // The smaller line under them: why the round ended, or whose clutch or ace it was.
  below: string
}

// A banner's headline is its tallest text. In the owner's clips VALORANT's round banners read
// "GEWONNEN" over "GEGNERISCHES TEAM ELIMINIERT", or "KNAPP" (clutch) or "ASS" (ace) over the
// player's name.
export function bannerParts(segments: OcrSegment[]): Banner {
  const rows = lines(segments)
  if (rows.length === 0) return { headline: '', below: '' }
  const tallest = (row: OcrSegment[]): number => Math.max(...row.map((s) => s.height))
  const top = rows.reduce((best, row) => (tallest(row) > tallest(best) ? row : best))
  const text = (row: OcrSegment[]): string => row.map((s) => s.text.trim()).join(' ')
  return {
    headline: text(top).trim(),
    below: rows
      .slice(rows.indexOf(top) + 1)
      .map(text)
      .join(' ')
      .trim()
  }
}
