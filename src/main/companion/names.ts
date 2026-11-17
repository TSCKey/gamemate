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
// name is tolerated by also trying every run of words as long as the name, but a title card shows
// little besides the name, so ordinary sentences must not produce one: short and one-word names must match
// exactly, and only a word or two may sit outside the match. On equal scores the longer name wins,
// so "Lost Lace" is not taken for "Lace".
export function matchName(text: string, names: string[], minSimilarity = 0.8): string | null {
  const words = clean(text).split(' ').filter(Boolean)
  if (words.length === 0) return null
  let best: string | null = null
  let bestScore = 0
  let bestSize = 0
  let bestLength = 0
  for (const name of names) {
    const target = clean(name)
    if (!target) continue
    const size = target.split(' ').length
    const extra = words.length - size
    if (extra < 0 || extra > (size <= 2 ? 1 : 2)) continue
    const exact = target.length <= 6 || size === 1
    for (let i = 0; i <= extra; i++) {
      const score = similarity(words.slice(i, i + size).join(' '), target)
      if (score < minSimilarity || (exact && score < 1)) continue
      const better =
        score > bestScore ||
        (score === bestScore &&
          (size > bestSize || (size === bestSize && target.length > bestLength)))
      if (better) {
        best = name
        bestScore = score
        bestSize = size
        bestLength = target.length
      }
    }
  }
  return best
}
