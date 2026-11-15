// Turns what the vision model copied from the feed and banners into events. The model only reads
// text, which it does reliably; deciding whose line it is happens here, in code, because the small
// local models got that wrong when asked.
import {
  cleanName,
  makeEvent,
  type FrameReport,
  type GameEvent,
  type GameEventType
} from './events'

// Only these are left to the model. Results are decided from the words in the banner: asked to
// classify them, the real model called "ROUND 5" a round won and "CLUTCH" a victory.
export type BannerKind = 'none' | 'eliminated_enemy' | 'killed_by'

export const BANNER_KINDS: BannerKind[] = ['none', 'eliminated_enemy', 'killed_by']

// What result banners say. A banner that isn't on this list gets no reaction, which beats
// congratulating someone on a loss.
const RESULT_WORDS: [GameEventType, string[]][] = [
  [
    'victory',
    [
      'victory',
      'victory royale',
      'sieg',
      'victoire',
      'victoria',
      'vitoria',
      'vittoria',
      'победа',
      'zafer',
      'galibiyet',
      'انتصار',
      'فوز',
      '勝利',
      '승리',
      '胜利'
    ]
  ],
  [
    'defeat',
    [
      'defeat',
      'niederlage',
      'defaite',
      'derrota',
      'sconfitta',
      'поражение',
      'yenilgi',
      'maglubiyet',
      'هزيمة',
      '敗北',
      '패배',
      '失败',
      '战败'
    ]
  ],
  [
    'round_won',
    [
      'round won',
      'round win',
      'runde gewonnen',
      'manche gagnee',
      'ronda ganada',
      'rodada vencida',
      'round vinto',
      'раунд выигран',
      'tur kazanildi',
      'جولة مربوحة',
      'ラウンド勝利',
      '라운드 승리',
      '回合胜利'
    ]
  ],
  [
    'round_lost',
    [
      'round lost',
      'round loss',
      'runde verloren',
      'manche perdue',
      'ronda perdida',
      'rodada perdida',
      'round perso',
      'раунд проигран',
      'tur kaybedildi',
      'جولة خاسرة',
      'ラウンド敗北',
      '라운드 패배',
      '回合失败'
    ]
  ]
]

// Accents and punctuation vary between games, so they don't count.
const plainWords = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const withoutNumbers = (text: string): string =>
  plainWords(text)
    .split(' ')
    .filter((word) => !/^\p{N}+$/u.test(word))
    .join(' ')

const RESULTS = new Map<string, GameEventType>(
  RESULT_WORDS.flatMap(([type, words]) =>
    words.map((word): [string, GameEventType] => [withoutNumbers(word), type])
  )
)

const MAX_EVENTS = 4
const MIN_PARTIAL_NAME = 3

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalized = (text: string): string => text.trim().toLowerCase()

export function parsePlayerNames(setting: string): string[] {
  return setting
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

// A Riot ID's "#tag" isn't shown in a feed, and a clan tag can come before the name.
function isPlayer(text: string, names: string[]): boolean {
  const shown = normalized(text)
  if (!shown) return false
  return names.some((name) => {
    const base = normalized(name.split('#')[0])
    if (!base) return false
    if (shown === base) return true
    return base.length >= MIN_PARTIAL_NAME && shown.split(/[\s[\]()<>|]+/).includes(base)
  })
}

function feedEvents(raw: unknown, time: number, names: string[]): GameEvent[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): GameEvent[] => {
    if (!isRecord(entry)) return []
    const left = cleanName(entry.left)
    const right = cleanName(entry.right)
    const playerLeft = isPlayer(left, names)
    const playerRight = isPlayer(right, names)
    if (playerLeft === playerRight) return []
    return playerLeft
      ? [makeEvent('kill', time, 'vision', { detail: `Eliminated ${right}.`, opponent: right })]
      : [makeEvent('death', time, 'vision', { detail: `Eliminated by ${left}.`, opponent: left })]
  })
}

function bannerEvents(reply: Record<string, unknown>, time: number): GameEvent[] {
  const text = cleanName(reply.banner_text)
  if (!text) return []
  const result = RESULTS.get(withoutNumbers(text))
  if (result) return [makeEvent(result, time, 'vision', { detail: text, importance: 9 })]

  const kind = BANNER_KINDS.find((k) => k === reply.banner_kind) ?? 'none'
  if (kind === 'none') return []
  const name = cleanName(reply.banner_name)
  // A name has to really be in the banner.
  const opponent = /\p{L}/u.test(name) && plainWords(text).includes(plainWords(name)) ? name : ''
  if (kind === 'killed_by') return [makeEvent('death', time, 'vision', { detail: text, opponent })]
  // A nameless kill can't be told from the same banner read again on the next look.
  return opponent ? [makeEvent('kill', time, 'vision', { detail: text, opponent })] : []
}

export function readAreas(raw: unknown, capturedAt: number, names: string[]): FrameReport {
  const reply = isRecord(raw) ? raw : {}
  const seen = new Set<string>()
  const events = [
    ...bannerEvents(reply, capturedAt),
    ...feedEvents(reply.feed_lines, capturedAt, names)
  ]
    .filter((event) => {
      const key = `${event.type}:${event.opponent.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_EVENTS)
  return {
    time: capturedAt,
    source: 'vision',
    phase: events.some((e) => e.category === 'match') ? 'intermission' : 'playing',
    inFight: false,
    score: null,
    description: cleanName(reply.banner_text),
    events
  }
}
