// Text read off the screen is never exact, so names are compared loosely: without case, accents
// or punctuation, and allowing a few misread letters.

const clean = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

const similarity = (a: string, b: string): number =>
  1 - distance(a, b) / Math.max(a.length, b.length, 1)

// The known name the text matches best, or null when nothing is close enough. Noise around the
// name is tolerated by also trying every run of words as long as the name.
export function matchName(text: string, names: string[], minSimilarity = 0.8): string | null {
  const words = clean(text).split(' ').filter(Boolean)
  if (words.length === 0) return null
  let best: string | null = null
  let bestScore = 0
  for (const name of names) {
    const target = clean(name)
    const size = target.split(' ').length
    if (!target) continue
    for (let i = 0; i + size <= words.length || i === 0; i++) {
      const score = similarity(words.slice(i, i + size).join(' '), target)
      if (score > bestScore) {
        bestScore = score
        best = name
      }
    }
  }
  return bestScore >= minSimilarity ? best : null
}
