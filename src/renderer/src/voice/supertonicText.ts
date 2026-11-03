// Text preparation for the Supertonic voice, following Supertone's MIT-licensed sample code
// (github.com/supertone-oss-archive/supertonic, web/helper.js), and splitting answers into
// pieces short enough to speak one after another.
import type { LanguageCode } from '../../../shared/languages'

// The languages Supertonic 3 reads ('na' = no particular language).
const SUPERTONIC_LANGUAGES = [
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
  'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na'
] // prettier-ignore

const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu

const REPLACEMENTS: [string, string][] = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
  ['→', ' '],
  ['←', ' '],
  ['@', ' ']
]

// Normalizes the text and wraps it in its language tag: "<en>Hello.</en>". Unlike Supertone's
// sample it doesn't expand English abbreviations ("e.g."), since answers come in many languages.
export function prepareText(text: string, lang: string): string {
  // Only reaches the log: GameMate never sends a language Supertonic doesn't read.
  if (!SUPERTONIC_LANGUAGES.includes(lang)) throw new RangeError(`lang=${lang}`)
  text = text.normalize('NFKD').replace(EMOJI, '')
  for (const [from, to] of REPLACEMENTS) text = text.replaceAll(from, to)
  text = text
    .replace(/[♥☆♡©\\]/g, '')
    .replace(/ ([,.!?;:'])/g, '$1')
    .replace(/""+/g, '"')
    .replace(/''+/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (!/[.!?;:,'")\]}…。」』】〉》›»؟！？]$/.test(text)) text += '.'
  return `<${lang}>${text}</${lang}>`
}

// The model's character ids. Characters it doesn't know are left out rather than sent as -1.
export function textToIds(text: string, indexer: number[]): number[] {
  const ids: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    const id = code < indexer.length ? indexer[code] : -1
    if (id >= 0) ids.push(id)
  }
  return ids
}

// Ends of sentences: Latin marks need a following space ("1.5" stays whole); Chinese, Japanese
// and Arabic marks end a sentence by themselves.
const SENTENCE_END =
  /(?<=[.!?…]["'”’)\]]*)\s+|(?<=[。！？؟]["'”’)\]」』]*)(?![。！？؟"'”’)\]」』])\s*/u
const CLAUSE_END = /(?<=[,、，،;；])/u

// Pieces of at most `limit` characters: whole clauses where they fit, otherwise cut at a space.
function shorten(sentence: string, limit: number): string[] {
  if (sentence.length <= limit) return [sentence]
  const pieces: string[] = []
  let current = ''
  for (const clause of sentence.split(CLAUSE_END)) {
    if ((current + clause).trim().length <= limit) {
      current += clause
      continue
    }
    if (current.trim()) pieces.push(current.trim())
    current = clause
    while (current.trim().length > limit) {
      const text = current.trim()
      const space = text.lastIndexOf(' ', limit)
      const cut = space > limit / 2 ? space : limit
      pieces.push(text.slice(0, cut).trim())
      current = text.slice(cut)
    }
  }
  if (current.trim()) pieces.push(current.trim())
  return pieces
}

// An answer as pieces to speak one after another, so the first words start quickly. Japanese
// and Korean pieces stay shorter, as Supertone's sample does.
export function splitForSpeech(text: string, language: LanguageCode): string[] {
  const limit = language === 'ja' || language === 'ko' ? 120 : 300
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => shorten(s, limit))
}
