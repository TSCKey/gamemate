// The companion's one internal event format, and how a source's raw report becomes it. Today the
// only source is the vision model reading screenshots. Another source (a game's official local
// data feed, say) only has to produce GameEvents with its own `source`; everything after this
// file works the same.
import { EVENT_TYPES } from '../../shared/types'
import type { CommentaryCategory, EventType } from '../../shared/types'

export type GameEventType = Exclude<EventType, 'none'>
export type Tier = 'minor' | 'significant' | 'exceptional'
export type Mood = 'positive' | 'negative' | 'tense' | 'neutral'
export type EventSource = 'vision' | 'memory' | 'screen'
export type Phase = 'playing' | 'intermission' | 'menu'

export interface GameEvent {
  id: string
  type: GameEventType
  category: CommentaryCategory
  mood: Mood
  tier: Tier
  // When it happened on screen (when the frame was captured), not when the model answered.
  time: number
  source: EventSource
  importance: number
  // Facts in English, as read off the screen or worked out by match memory.
  detail: string
  // Names printed on screen, '' when none is.
  opponent: string
  place: string
  count: number
}

// What one look at the game produced.
export interface FrameReport {
  time: number
  source: EventSource
  phase: Phase
  inFight: boolean
  score: { own: number; enemy: number } | null
  description: string
  events: GameEvent[]
  // Screen checks only: the player left the room, so any boss fight ended, with no word on how.
  // It is no event: nothing is said or logged about it, the fight is just forgotten.
  fightEnded?: boolean
}

export interface EventRule {
  category: CommentaryCategory
  tier: Tier
  mood: Mood
  // Who wins inside the same tier.
  priority: number
  // Before the same kind of event gets another comment (scaled by the frequency setting).
  cooldownMs: number
  // Too old to react to after this long.
  staleMs: number
  // Sightings of the same event closer together than this are one event.
  dedupeMs: number
  // A screen that stays up (death, victory): it stays one event for as long as it is seen.
  sticky?: boolean
  // Only a repeat if the same name is on it: two nameless kills can be two kills.
  namedDedupe?: boolean
  // Time-sensitive: worth saying even mid-fight.
  urgent?: boolean
  // What this event means, for writing the reaction.
  meaning: string
  // How the model spots it on screen. Events without one are only worked out by match memory.
  seen?: string
}

const S = 1000

export const EVENT_RULES: Record<GameEventType, EventRule> = {
  kill: {
    category: 'combat',
    tier: 'minor',
    mood: 'positive',
    priority: 40,
    cooldownMs: 20 * S,
    staleMs: 25 * S,
    dedupeMs: 30 * S,
    namedDedupe: true,
    meaning: 'The player eliminated an opponent.',
    seen: 'the player themself eliminated someone: a banner like "ELIMINATED <name>", a medal or their own highlighted kill-feed line'
  },
  assist: {
    category: 'combat',
    tier: 'minor',
    mood: 'positive',
    priority: 30,
    cooldownMs: 30 * S,
    staleMs: 25 * S,
    dedupeMs: 30 * S,
    namedDedupe: true,
    meaning: 'The player helped secure an elimination.',
    seen: 'text or a medal says the player got an assist'
  },
  headshot: {
    category: 'combat',
    tier: 'minor',
    mood: 'positive',
    priority: 45,
    cooldownMs: 30 * S,
    staleMs: 25 * S,
    dedupeMs: 30 * S,
    namedDedupe: true,
    // Not asked of the model: a headshot icon sits on every player's kill-feed line, and small
    // models can't tell the player's line from a teammate's. A source that knows can report it.
    meaning: "The player's elimination was a headshot."
  },
  multikill: {
    category: 'combat',
    tier: 'significant',
    mood: 'positive',
    priority: 70,
    cooldownMs: 20 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    meaning: 'The player eliminated several opponents in quick succession.',
    seen: 'a double/triple/multi-kill banner in the middle of the screen, never a badge on a kill-feed line; put the number in "count"'
  },
  kill_streak: {
    category: 'combat',
    tier: 'significant',
    mood: 'positive',
    priority: 75,
    cooldownMs: 30 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    // Worked out by match memory from the player's own kills. Not asked of the model: streak
    // badges sit on kill-feed lines, a teammate's included, and were taken for the player's.
    meaning: 'The player keeps eliminating opponents without being eliminated.'
  },
  death: {
    category: 'combat',
    tier: 'minor',
    mood: 'negative',
    priority: 60,
    cooldownMs: 30 * S,
    staleMs: 20 * S,
    dedupeMs: 8 * S,
    sticky: true,
    meaning: 'The player was eliminated or died.',
    seen: 'the player died or failed: a screen like "KILLED BY <name>", a kill-cam or game over; put who did it in "opponent" if printed'
  },
  fight_won: {
    category: 'combat',
    tier: 'significant',
    mood: 'positive',
    priority: 65,
    cooldownMs: 60 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    meaning: 'The player won a hard fight, such as a boss.',
    seen: 'text on screen shows a boss or hard fight was beaten'
  },
  clutch: {
    category: 'skill',
    tier: 'exceptional',
    mood: 'positive',
    priority: 90,
    cooldownMs: 30 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    meaning: 'The player won a round or fight alone against the odds.',
    seen: 'a banner or medal says the player clutched'
  },
  recovery: {
    category: 'skill',
    tier: 'minor',
    mood: 'positive',
    priority: 20,
    cooldownMs: 120 * S,
    staleMs: 30 * S,
    dedupeMs: 30 * S,
    meaning: 'The player was very low on health a moment ago and is still alive.'
  },
  teammate_saved: {
    category: 'teamwork',
    tier: 'significant',
    mood: 'positive',
    priority: 50,
    cooldownMs: 45 * S,
    staleMs: 25 * S,
    dedupeMs: 20 * S,
    meaning: 'The player saved or revived a teammate.',
    seen: 'a save or revive medal or text for the player'
  },
  team_wipe: {
    category: 'teamwork',
    tier: 'significant',
    mood: 'positive',
    priority: 72,
    cooldownMs: 30 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    meaning: "The player's team eliminated the whole enemy team.",
    seen: "a banner says the player's team wiped the enemy team (ACE, TEAM KILL, SQUAD WIPED)"
  },
  objective_won: {
    category: 'objectives',
    tier: 'significant',
    mood: 'positive',
    priority: 62,
    cooldownMs: 30 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    meaning: "The player's team captured, took or held an objective.",
    seen: "text shows the player's team captured or defended an objective"
  },
  objective_lost: {
    category: 'objectives',
    tier: 'significant',
    mood: 'negative',
    priority: 58,
    cooldownMs: 45 * S,
    staleMs: 30 * S,
    dedupeMs: 20 * S,
    meaning: "The enemy took an objective from the player's team.",
    seen: 'text shows the enemy team captured an objective'
  },
  objective_contested: {
    category: 'objectives',
    tier: 'minor',
    mood: 'tense',
    priority: 35,
    cooldownMs: 60 * S,
    staleMs: 20 * S,
    dedupeMs: 20 * S,
    meaning: 'An objective is being fought over.',
    seen: 'the objective is shown as contested'
  },
  bomb_planted: {
    category: 'objectives',
    tier: 'significant',
    mood: 'tense',
    priority: 64,
    cooldownMs: 30 * S,
    staleMs: 20 * S,
    dedupeMs: 30 * S,
    meaning: 'The bomb or spike was planted.',
    seen: 'text or the round timer shows the bomb or spike was planted'
  },
  bomb_defused: {
    category: 'objectives',
    tier: 'significant',
    mood: 'neutral',
    priority: 66,
    cooldownMs: 30 * S,
    staleMs: 20 * S,
    dedupeMs: 30 * S,
    meaning: 'The bomb or spike was defused.',
    seen: 'text shows the bomb or spike was defused'
  },
  round_won: {
    category: 'match',
    tier: 'significant',
    mood: 'positive',
    priority: 55,
    cooldownMs: 20 * S,
    staleMs: 30 * S,
    dedupeMs: 25 * S,
    sticky: true,
    meaning: "The player's team won the round or scored.",
    seen: "a banner says the player's team won the round or scored"
  },
  round_lost: {
    category: 'match',
    tier: 'minor',
    mood: 'negative',
    priority: 52,
    cooldownMs: 30 * S,
    staleMs: 30 * S,
    dedupeMs: 25 * S,
    sticky: true,
    meaning: "The player's team lost the round or conceded.",
    seen: "a banner says the player's team lost the round or conceded"
  },
  match_point: {
    category: 'match',
    tier: 'significant',
    mood: 'tense',
    priority: 78,
    cooldownMs: 60 * S,
    staleMs: 30 * S,
    dedupeMs: 30 * S,
    sticky: true,
    meaning: 'One round or point can now decide the match.',
    seen: 'a match point or overtime banner'
  },
  comeback: {
    category: 'match',
    tier: 'exceptional',
    mood: 'positive',
    priority: 95,
    cooldownMs: 120 * S,
    staleMs: 30 * S,
    dedupeMs: 60 * S,
    meaning: "The player's team was clearly behind on the scoreboard and has caught up."
  },
  win_streak: {
    category: 'match',
    tier: 'significant',
    mood: 'positive',
    priority: 77,
    cooldownMs: 30 * S,
    staleMs: 30 * S,
    dedupeMs: 25 * S,
    meaning: "The player's team has won several rounds in a row."
  },
  loss_streak: {
    category: 'match',
    tier: 'significant',
    mood: 'negative',
    priority: 54,
    cooldownMs: 180 * S,
    staleMs: 30 * S,
    dedupeMs: 25 * S,
    meaning: "The player's team has lost several rounds in a row."
  },
  victory: {
    category: 'match',
    tier: 'exceptional',
    mood: 'positive',
    priority: 100,
    cooldownMs: 60 * S,
    staleMs: 60 * S,
    dedupeMs: 45 * S,
    sticky: true,
    meaning: 'The player won the match.',
    seen: 'a victory screen'
  },
  defeat: {
    category: 'match',
    tier: 'significant',
    mood: 'negative',
    priority: 98,
    cooldownMs: 60 * S,
    staleMs: 60 * S,
    dedupeMs: 45 * S,
    sticky: true,
    meaning: 'The player lost the match.',
    seen: 'a defeat screen'
  },
  milestone: {
    category: 'match',
    tier: 'significant',
    mood: 'positive',
    priority: 60,
    cooldownMs: 60 * S,
    staleMs: 30 * S,
    dedupeMs: 60 * S,
    meaning: 'The player reached a personal milestone.',
    seen: 'a level-up, rank-up or achievement banner'
  },
  // The two below come from the screen source only, so they have no `seen`: the vision model
  // is never asked for them.
  boss_encounter: {
    category: 'combat',
    tier: 'significant',
    mood: 'tense',
    priority: 80,
    cooldownMs: 20 * S,
    staleMs: 20 * S,
    // Short: the screen checks already give one title per showing, and a title shown again after
    // a quick death and retry is a new attempt.
    dedupeMs: 8 * S,
    meaning: 'The player is facing a boss.'
  },
  area_entered: {
    category: 'world',
    tier: 'minor',
    mood: 'positive',
    priority: 30,
    cooldownMs: 60 * S,
    staleMs: 20 * S,
    dedupeMs: 120 * S,
    meaning: 'The player entered a new area.'
  },
  low_health: {
    category: 'world',
    tier: 'significant',
    mood: 'tense',
    priority: 85,
    cooldownMs: 180 * S,
    staleMs: 12 * S,
    dedupeMs: 8 * S,
    sticky: true,
    urgent: true,
    meaning: "The player's health is very low.",
    seen: "the player's health is very low (9)"
  },
  hostile_mob: {
    category: 'world',
    tier: 'minor',
    mood: 'tense',
    priority: 50,
    cooldownMs: 180 * S,
    staleMs: 12 * S,
    dedupeMs: 8 * S,
    urgent: true,
    meaning: 'An enemy, boss or other danger is close to the player.',
    seen: 'an enemy, boss or other danger is close to the player (7-9, higher if very close)'
  },
  dark_area: {
    category: 'world',
    tier: 'minor',
    mood: 'tense',
    priority: 15,
    cooldownMs: 180 * S,
    staleMs: 30 * S,
    dedupeMs: 30 * S,
    meaning: 'The player is in a dark area where mobs can spawn.',
    seen: 'the player is in a dark cave or area where mobs can spawn (4-6)'
  },
  discovery: {
    category: 'world',
    tier: 'minor',
    mood: 'positive',
    priority: 25,
    cooldownMs: 180 * S,
    staleMs: 45 * S,
    dedupeMs: 30 * S,
    meaning: 'Something notable was found or is in view.',
    seen: 'a notable place, item, find or opportunity is clearly visible (5-7)'
  },
  other: {
    category: 'world',
    tier: 'minor',
    mood: 'neutral',
    priority: 5,
    cooldownMs: 180 * S,
    staleMs: 30 * S,
    dedupeMs: 30 * S,
    meaning: 'Something else a player would want to know about.',
    seen: 'something else a player would want to know about (1-5)'
  }
}

export interface VisionGame {
  id: string
  name: string
  competitive: boolean
}

const SURVIVAL_TYPES: GameEventType[] = [
  'death',
  'low_health',
  'hostile_mob',
  'dark_area',
  'discovery',
  'fight_won',
  'milestone',
  'other'
]

// Everything the screen can show, minus what depends on the kind of game.
const SEEABLE_TYPES = (Object.keys(EVENT_RULES) as GameEventType[]).filter(
  (type) => EVENT_RULES[type].seen !== undefined && type !== 'dark_area'
)

// What the model is asked to look for. Competitive games get no "enemy nearby": telling a player
// where enemies are during a ranked match is real-time help that many games' rules forbid.
export function visionEventTypes(game: VisionGame): GameEventType[] {
  if (game.id === 'minecraft') return SURVIVAL_TYPES
  return game.competitive ? SEEABLE_TYPES.filter((t) => t !== 'hostile_mob') : SEEABLE_TYPES
}

const MAX_EVENTS_PER_LOOK = 4
const MAX_COUNT = 10
const MAX_DETAIL = 140
const MAX_NAME = 32
const PLACEHOLDER_NAME =
  /^(?:unknown|n\/?a|none|null|nobody|enemy|opponent|player|the player|the enemy|-)?$/i

// Text read off a game screen goes into later prompts, so it stays one short line.
function line(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

export function cleanName(value: unknown): string {
  const text = line(value, MAX_NAME)
  return PLACEHOLDER_NAME.test(text) ? '' : text
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Math.round(Number(value))
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

let nextId = 0

export function makeEvent(
  type: GameEventType,
  time: number,
  source: EventSource,
  fields: Partial<Pick<GameEvent, 'importance' | 'detail' | 'opponent' | 'place' | 'count'>> = {}
): GameEvent {
  const rule = EVENT_RULES[type]
  return {
    id: `${source}-${++nextId}`,
    type,
    category: rule.category,
    mood: rule.mood,
    tier: rule.tier,
    time,
    source,
    importance: 7,
    detail: '',
    opponent: '',
    place: '',
    count: 1,
    ...fields
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Small models mix up "ELIMINATED Sova" (the player's kill) and "KILLED BY Sova" (their death).
// The words the model quoted settle it.
function fixKillOrDeath(type: GameEventType, detail: string, opponent: string): GameEventType {
  if ((type !== 'kill' && type !== 'death') || !opponent) return type
  const enemy = escapeRegExp(opponent)
  if (new RegExp(`\\b(?:eliminated|killed|slain)\\s+by\\s+${enemy}`, 'i').test(detail))
    return 'death'
  if (new RegExp(`\\b(?:eliminated|killed|slain)\\s+${enemy}`, 'i').test(detail)) return 'kill'
  return type
}

function visionEvent(raw: unknown, time: number): GameEvent | null {
  if (!isRecord(raw) || raw.sure !== true) return null
  const type = EVENT_TYPES.find((t) => t === raw.type)
  if (!type || type === 'none' || EVENT_RULES[type].seen === undefined) return null
  const detail = line(raw.detail, MAX_DETAIL)
  const opponent = cleanName(raw.opponent)
  return makeEvent(fixKillOrDeath(type, detail, opponent), time, 'vision', {
    importance: clamp(raw.importance, 0, 10, 0),
    detail,
    opponent,
    place: cleanName(raw.place),
    count: clamp(raw.count, 1, MAX_COUNT, 1)
  })
}

// Turns the vision model's reply into a report, keeping only what it was sure it saw. A reply
// that makes no sense becomes an empty report rather than an error.
export function normalizeVisionReport(raw: unknown, capturedAt: number): FrameReport {
  const reply = isRecord(raw) ? raw : {}
  const phase: Phase =
    reply.phase === 'menu' || reply.phase === 'intermission' ? reply.phase : 'playing'
  const own = clamp(reply.own_score, -1, 999, -1)
  const enemy = clamp(reply.enemy_score, -1, 999, -1)
  const score = phase !== 'menu' && own >= 0 && enemy >= 0 ? { own, enemy } : null
  const events =
    phase === 'menu' || !Array.isArray(reply.events)
      ? []
      : reply.events
          .slice(0, MAX_EVENTS_PER_LOOK * 2)
          .map((e) => visionEvent(e, capturedAt))
          .filter((e): e is GameEvent => e !== null)
          .slice(0, MAX_EVENTS_PER_LOOK)
  return {
    time: capturedAt,
    source: 'vision',
    phase,
    inFight: reply.in_fight === true,
    score,
    description: line(reply.description, 300),
    events
  }
}
