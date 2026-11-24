// Rocket League read off the screen, for players who haven't turned on the game's Stats API. What
// the screen says is turned into the messages the Stats API would have sent (rocketReading.ts),
// so both ways of following a match tell the same moments the same way.
//
// Three things on the screen are read, all drawn by the game itself:
// - the scoreboard at the top (rocketHud.ts): the two scores, the clock and overtime. A score is
//   taken once it reads the same twice in a row, and a goal is a score going up by one;
// - the popups in the middle that the game shows the player about their own play ("SHOT ON GOAL",
//   "EPIC SAVE", "AERIAL GOAL"), and its announcements ("<name> SCORED!", "OVERTIME"). A kickoff
//   is the clock starting again after standing still: "GO!" is read too unreliably, and "GO" was
//   read inside "GOAL";
// - the replay's "SCORED BY <name>" card, for who scored.
// The popups are only ever about the player, so they need no name. The other cars' name tags are
// never read: a vision model once took them for elimination banners.
import type { RocketMessage } from './rocketReading'
import type { Scoreboard } from './rocketHud'
import type { Box } from './hudAreas'

// The name the reader gives the player in the messages it makes.
export const PLAYER = 'you'

// Where the game shows its popups and announcements, and the replay's card, as fractions of the
// game window (measured on the owner's clips, 1080p and 720p).
export const MIDDLE_AREA: Box = { x: 0.28, y: 0.13, width: 0.44, height: 0.3 }
export const REPLAY_AREA: Box = { x: 0.32, y: 0.74, width: 0.36, height: 0.14 }

// Two reads in a row make a score.
const STABLE_READS = 2
// After a goal, the popups that name it come one after another, "SHOT ON GOAL" and "GOAL" (or
// "ASSIST") first, a couple of seconds after the scoreboard changes: the goal is told once they
// had time to. The ones after ("AERIAL GOAL", "HAT TRICK") can take ten seconds more; they are
// added to the goal already told.
const GOAL_SETTLE_MS = 4_500
const LATE_POPUP_MS = 12_000
// A goal nobody could place on a side is dropped after this long.
const GOAL_GIVE_UP_MS = 6_000
// A popup stays up for two or three seconds: read again within this, it's the same one.
const POPUP_REPEAT_MS = 5_000
const KICKOFF_REPEAT_MS = 10_000
// The clock stops for a goal's replay and the kickoff countdown: running again after standing
// still this long, it's a kickoff.
const CLOCK_STOPPED_MS = 2_500
// At 0:00 the match ends when the ball next touches the ground: with no goal for this long, it
// has.
const END_WAIT_MS = 5_000
// A clock this much higher than before, after the match ended: a new match.
const NEW_MATCH_CLOCK_JUMP = 30
// The scoreboard gone from the top of the screen this long, with the clock having run: the match
// ended before time ran out, almost always by a forfeit (the game shows no result banner the
// reader knows yet). The team ahead is taken as the winner; level, the result isn't told.
const BOARD_GONE_MS = 8_000
// Text in the middle of the screen that isn't a popup is noted for the log, at most this many
// different lines a match, so new popups and end screens can be found and added.
const MAX_UNKNOWN_TEXT = 40

// The popups the game shows about the player, with the Stats API's name for each.
const POPUPS: [string, string][] = [
  ['GOAL', 'Goal'],
  ['AERIAL GOAL', 'AerialGoal'],
  ['BACKWARDS GOAL', 'BackwardsGoal'],
  ['BICYCLE GOAL', 'BicycleGoal'],
  ['LONG GOAL', 'LongGoal'],
  ['TURTLE GOAL', 'TurtleGoal'],
  ['POOL SHOT', 'PoolShot'],
  ['OVERTIME GOAL', 'OvertimeGoal'],
  ['SWISH GOAL', 'SwishGoal'],
  ['HAT TRICK', 'HatTrick'],
  ['ASSIST', 'Assist'],
  ['PLAYMAKER', 'Playmaker'],
  ['SAVE', 'Save'],
  ['EPIC SAVE', 'EpicSave'],
  ['SAVIOR', 'Savior'],
  ['SHOT ON GOAL', 'Shot'],
  ['CENTER BALL', 'Center'],
  ['CLEAR BALL', 'Clear'],
  ['FIRST TOUCH', 'FirstTouch'],
  ['AERIAL HIT', 'AerialHit'],
  ['BICYCLE HIT', 'BicycleHit'],
  ['JUGGLE', 'Juggle'],
  ['DEMOLITION', 'Demolish'],
  ['EXTERMINATION', 'Extermination'],
  ['WIN', 'Win'],
  ['MVP', 'MVP']
]
const GOAL_POPUPS = new Set([
  'Goal',
  'AerialGoal',
  'BackwardsGoal',
  'BicycleGoal',
  'LongGoal',
  'TurtleGoal',
  'PoolShot',
  'OvertimeGoal',
  'SwishGoal',
  'HatTrick'
])
// The match scoreboard (held open with a key) lists these: its words aren't popups.
const SCOREBOARD_WORDS = ['SCORE', 'GOALS', 'ASSISTS', 'SAVES', 'SHOTS', 'PING']

const letters = (text: string): string => text.toUpperCase().replace(/[^A-Z]/g, '')

// Edits between two words (insertions, deletions, swaps of one letter).
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

// The text reader sometimes misses or swaps a letter of a popup's thin capitals; short words
// must be exact.
const allowed = (length: number): number => (length <= 4 ? 0 : length <= 8 ? 1 : 2)

// The Stats API name of the popup a line of text shows, or null.
export function popupOf(line: string): string | null {
  const read = letters(line)
  if (read.length < 3 || line.trim().split(/\s+/).length > 4) return null
  let best: { name: string; d: number } | null = null
  for (const [words, name] of POPUPS) {
    const d = distance(read, letters(words))
    if (d <= allowed(letters(words).length) && (!best || d < best.d)) best = { name, d }
  }
  return best?.name ?? null
}

// "<name> SCORED!" as the game announces a goal: the name, or null.
export function scoredBy(line: string): string | null {
  const m = /^(.*?)\s*SC[O0ÖÓ]R[EÉ]D\b/i.exec(line.trim())
  if (!m) return null
  const name = cleanName(m[1])
  return name || null
}

// A name as the game prints it, without a club tag in brackets in front (whose closing bracket the
// text reader may read as a letter).
function cleanName(text: string): string {
  return text
    .replace(/^\s*[[(]\S*\s+(?=\S)/, '')
    .replace(/[^\p{L}\p{N}_\-. ]/gu, '')
    .trim()
}

// Whether a name read off the screen is one of the player's names from the settings.
function isPlayerName(read: string, names: string[]): boolean {
  const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  // The whole of what was read, or its last words (after a club tag read as a word).
  const words = read.trim().split(/\s+/)
  const shown = words.map((_, i) => plain(words.slice(i).join(''))).filter((w) => w.length >= 3)
  return names.some((name) => {
    const own = plain(name.split('#')[0])
    return own.length >= 3 && shown.some((w) => distance(w, own) <= (own.length >= 6 ? 1 : 0))
  })
}

export interface RocketLook {
  time: number
  // The scoreboard as read, or null when it wasn't grabbed.
  board: Scoreboard | null
  // Lines of text read in the middle of the screen, and on the replay card ([] when not read).
  middle: string[]
  replay: string[]
}

export interface ScreenReading {
  messages: RocketMessage[]
  // What was read and what came of it, for the log and the developer inspector.
  notes: string[]
  // Text in the middle of the screen that isn't known yet, for the developer inspector only: it
  // can hold other players' names, which GameMate's log never does.
  unknown: string[]
}

interface PendingGoal {
  at: number
  // 0: the player's team, 1: the other team, null: not known yet.
  side: 0 | 1 | null
  // The scoreboard already showed it.
  scoreSeen: boolean
  playerScored: boolean
  playerAssisted: boolean
  // Names read as the scorer, with how often: a name is used once it was read the same twice,
  // so a misread one ("BLCk.ÅE-8PØ") is never said.
  scorers: Map<string, number>
  // The goal popups for the player ("AERIAL GOAL"), as Stats API names.
  kinds: string[]
}

export class RocketScreen {
  private score: [number, number] | null = null
  private scoreRead: { own: number; other: number; count: number } | null = null
  private clock: { seconds: number; overtime: boolean } | null = null
  private clockRead: { seconds: number; overtime: boolean } | null = null
  private started = false
  private ended = false
  private overtimeTold = false
  private pending: PendingGoal | null = null
  private popupAt = new Map<string, number>()
  private kickoffAt = -Infinity
  // The clock reading, when it was first read and when it was last read showing the same: a clock
  // that couldn't be read for a while didn't stand still.
  private clockSince: { seconds: number; at: number; lastAt: number } | null = null
  // The goal told last, for the popups that come after it.
  private told: { at: number; playerScored: boolean } | null = null
  private zeroAt: number | null = null
  // When the score was last read: while it can be, a goal is only a goal once it shows there.
  private boardAt = -Infinity
  // Since when the grabbed scoreboard has shown nothing readable at all.
  private boardGoneSince: number | null = null
  // The clock was seen running this match (so the scoreboard going away means it ended).
  private clockRan = false
  private unknownText = new Set<string>()
  private unknownOut: string[] = []

  look(look: RocketLook, names: string[]): ScreenReading {
    const messages: RocketMessage[] = []
    const notes: string[] = []
    this.unknownOut = []
    const { time } = look
    if (!this.started) {
      this.started = true
      messages.push({ Event: 'MatchCreated' }, this.state())
    }
    if (look.board) {
      this.readBoard(look.board, time, messages, notes)
      this.readClock(look.board, time, messages, notes)
      const gone =
        look.board.own === null && look.board.other === null && look.board.seconds === null
      this.boardGoneSince = gone ? (this.boardGoneSince ?? time) : null
    } else {
      // Not grabbed (the game isn't in front): nothing is known about it.
      this.boardGoneSince = null
    }
    this.readMiddle(look.middle, time, names, messages, notes)
    this.readReplay(look.replay, names, notes)
    this.settleGoal(time, messages, notes)
    this.checkEnd(time, messages, notes)
    return { messages, notes, unknown: this.unknownOut }
  }

  // Whether the replay card is worth reading: a goal is waiting to be told.
  wantsReplay(): boolean {
    return this.pending !== null
  }

  private state(): RocketMessage {
    const game: Record<string, unknown> = {}
    if (this.score) {
      game.Teams = [
        { TeamNum: 0, Score: this.score[0] },
        { TeamNum: 1, Score: this.score[1] }
      ]
    }
    if (this.clock) {
      game.TimeSeconds = this.clock.seconds
      game.bOvertime = this.clock.overtime
    }
    return { Event: 'UpdateState', Data: { Players: [{ Name: PLAYER, TeamNum: 0 }], Game: game } }
  }

  private newMatch(messages: RocketMessage[], notes: string[]): void {
    notes.push('a new match')
    this.score = null
    this.clock = null
    this.ended = false
    this.overtimeTold = false
    this.pending = null
    this.told = null
    this.clockSince = null
    this.clockRan = false
    this.boardGoneSince = null
    this.unknownText.clear()
    this.zeroAt = null
    this.popupAt.clear()
    messages.push({ Event: 'MatchDestroyed' }, { Event: 'MatchCreated' }, this.state())
  }

  // The clock, once two reads in a row agree (counting down, or up in overtime). Read after the
  // score, so what it brings ("30 seconds left") is said with the score as it is.
  private readClock(
    board: Scoreboard,
    time: number,
    messages: RocketMessage[],
    notes: string[]
  ): void {
    if (board.seconds !== null) {
      const before = this.clockRead
      const agrees =
        before !== null &&
        before.overtime === board.overtime &&
        Math.abs(board.seconds - before.seconds) <= 3
      this.clockRead = { seconds: board.seconds, overtime: board.overtime }
      if (agrees) {
        const last = this.clock
        if (
          this.ended &&
          last &&
          !board.overtime &&
          board.seconds > last.seconds + NEW_MATCH_CLOCK_JUMP
        ) {
          this.newMatch(messages, notes)
        }
        this.clock = { seconds: board.seconds, overtime: board.overtime }
        const still = this.clockSince
        if (still && still.seconds === board.seconds) {
          still.lastAt = time
        } else {
          if (still) this.clockRan = true
          if (still && still.lastAt - still.at >= CLOCK_STOPPED_MS) {
            this.kickoff(time, messages, notes)
          }
          this.clockSince = { seconds: board.seconds, at: time, lastAt: time }
        }
        if (board.overtime && !this.overtimeTold) {
          this.overtimeTold = true
          notes.push('overtime on the clock')
        }
        messages.push({
          Event: 'ClockUpdatedSeconds',
          Data: { TimeSeconds: board.seconds, bOvertime: board.overtime }
        })
      }
    } else {
      this.clockRead = null
    }
  }

  private readBoard(
    board: Scoreboard,
    time: number,
    messages: RocketMessage[],
    notes: string[]
  ): void {
    // The score, once two reads in a row agree.
    if (board.own === null || board.other === null) {
      this.scoreRead = null
      return
    }
    this.boardAt = time
    const read = this.scoreRead
    this.scoreRead =
      read && read.own === board.own && read.other === board.other
        ? { ...read, count: read.count + 1 }
        : { own: board.own, other: board.other, count: 1 }
    if (this.scoreRead.count < STABLE_READS) return
    const now: [number, number] = [board.own, board.other]
    const was = this.score
    if (was && was[0] === now[0] && was[1] === now[1]) return
    if (!was) {
      this.score = now
      notes.push(`score ${now[0]}-${now[1]}`)
      messages.push(this.state())
      return
    }
    if (now[0] === 0 && now[1] === 0) {
      this.newMatch(messages, notes)
      this.score = now
      messages.push(this.state())
      return
    }
    const up0 = now[0] - was[0]
    const up1 = now[1] - was[1]
    if ((up0 === 1 && up1 === 0) || (up0 === 0 && up1 === 1)) {
      const side = up0 === 1 ? 0 : 1
      this.score = now
      notes.push(
        `score ${now[0]}-${now[1]}: a goal for ${side === 0 ? 'the player’s team' : 'the other team'}`
      )
      if (this.pending && (this.pending.side === null || this.pending.side === side)) {
        this.pending.side = side
        this.pending.scoreSeen = true
      } else {
        this.pending = { ...this.newGoal(time), side, scoreSeen: true }
      }
      return
    }
    // Anything else is a misread somewhere or a match joined late: the board is the truth.
    notes.push(`score ${now[0]}-${now[1]} (taken as it is)`)
    this.score = now
    messages.push(this.state())
  }

  private newGoal(time: number): PendingGoal {
    return {
      at: time,
      side: null,
      scoreSeen: false,
      playerScored: false,
      playerAssisted: false,
      scorers: new Map(),
      kinds: []
    }
  }

  // The goal being put together, started if there is none.
  private goal(time: number): PendingGoal {
    if (!this.pending) this.pending = this.newGoal(time)
    return this.pending
  }

  private readMiddle(
    lines: string[],
    time: number,
    names: string[],
    messages: RocketMessage[],
    notes: string[]
  ): void {
    const words = new Set(lines.flatMap((l) => l.toUpperCase().split(/[^A-Z]+/)))
    if (SCOREBOARD_WORDS.filter((w) => words.has(w)).length >= 2) {
      if (lines.length) notes.push('the match scoreboard is open: its words are not popups')
      return
    }
    for (const line of lines) {
      const text = line.trim()
      if (!text) continue
      if (letters(text) === 'OVERTIME') {
        if (!this.overtimeTold) {
          this.overtimeTold = true
          notes.push('the overtime banner')
          messages.push({
            Event: 'ClockUpdatedSeconds',
            Data: { TimeSeconds: 0, bOvertime: true }
          })
        }
        continue
      }
      const scorer = scoredBy(text)
      if (scorer) {
        const goal = this.goal(time)
        if (isPlayerName(scorer, names)) goal.playerScored = true
        else goal.scorers.set(scorer, (goal.scorers.get(scorer) ?? 0) + 1)
        continue
      }
      const popup = popupOf(text)
      if (!popup) {
        const key = text.toUpperCase()
        if (
          letters(text).length >= 4 &&
          text.length <= 40 &&
          !this.unknownText.has(key) &&
          this.unknownText.size < MAX_UNKNOWN_TEXT
        ) {
          this.unknownText.add(key)
          this.unknownOut.push(text)
        }
        continue
      }
      const last = this.popupAt.get(popup) ?? -Infinity
      this.popupAt.set(popup, time)
      if (time - last <= POPUP_REPEAT_MS) continue
      notes.push(`popup "${text}": ${popup}`)
      // A popup after the goal was told belongs to it, unless another goal is being put together.
      const read = this.scoreRead
      const scoreChanging =
        read !== null &&
        this.score !== null &&
        (read.own !== this.score[0] || read.other !== this.score[1])
      const told =
        !this.pending && !scoreChanging && this.told && time - this.told.at <= LATE_POPUP_MS
          ? this.told
          : null
      if (told && (GOAL_POPUPS.has(popup) || popup === 'Assist')) {
        if (!told.playerScored) {
          notes.push(`"${text}" came after the goal was told as someone else's`)
        } else if (popup !== 'Goal' && popup !== 'HatTrick') {
          messages.push({
            Event: 'StatfeedEvent',
            Data: { EventName: popup, MainTarget: { Name: PLAYER } }
          })
        }
        continue
      }
      if (GOAL_POPUPS.has(popup)) {
        const goal = this.goal(time)
        goal.playerScored = true
        if (popup !== 'Goal' && popup !== 'HatTrick') goal.kinds.push(popup)
        continue
      }
      if (popup === 'Assist') {
        this.goal(time).playerAssisted = true
        continue
      }
      // The shot that scored is told by the goal.
      if (popup === 'Shot' && this.pending) continue
      if (popup === 'Win') {
        this.end(0, messages, notes, 'the win popup')
        continue
      }
      if (popup === 'MVP') continue
      messages.push({
        Event: 'StatfeedEvent',
        Data: { EventName: popup, MainTarget: { Name: PLAYER } }
      })
    }
  }

  private readReplay(lines: string[], names: string[], notes: string[]): void {
    if (!this.pending || lines.length === 0) return
    const at = lines.findIndex((l) => /SC[O0]R[EÉ]D\s*B/i.test(l))
    if (at < 0) return
    const rest = lines[at].replace(/^.*?SC[O0]R[EÉ]D\s*BY?/i, '').trim()
    const name = cleanName(rest || lines[at + 1] || '')
    if (!name) return
    if (isPlayerName(name, names)) this.pending.playerScored = true
    else this.pending.scorers.set(name, (this.pending.scorers.get(name) ?? 0) + 1)
    notes.push('the replay names the scorer')
  }

  private settleGoal(time: number, messages: RocketMessage[], notes: string[]): void {
    const goal = this.pending
    if (!goal || time - goal.at < GOAL_SETTLE_MS) return
    // The player's own popups put it on their team's side even before the board shows it.
    if (goal.side === null && (goal.playerScored || goal.playerAssisted)) goal.side = 0
    if (goal.side === null) {
      if (time - goal.at >= GOAL_GIVE_UP_MS) {
        notes.push('a goal was announced but the scoreboard never said for whom: not told')
        this.pending = null
      }
      return
    }
    // A popup alone makes a goal only while the scoreboard can't be read: where it can, the goal
    // has to show there (a popup half read could be another one).
    if (!goal.scoreSeen && time - this.boardAt < GOAL_SETTLE_MS) {
      if (time - goal.at >= GOAL_GIVE_UP_MS) {
        notes.push('a goal popup, but the scoreboard didn’t change: not told')
        this.pending = null
      }
      return
    }
    this.pending = null
    const side = goal.side
    // A popup can't make the other team's goal the player's.
    const playerScored = side === 0 && goal.playerScored
    const playerAssisted = side === 0 && goal.playerAssisted && !playerScored
    if (!goal.scoreSeen && this.score) this.score[side]++
    const named = [...goal.scorers].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0]
    const scorer = named?.[0] ?? ''
    // Told as of when it happened, not when it was put together.
    for (const kind of playerScored ? goal.kinds : []) {
      messages.push({
        Event: 'StatfeedEvent',
        Data: { EventName: kind, MainTarget: { Name: PLAYER } },
        At: goal.at
      })
    }
    messages.push({
      Event: 'GoalScored',
      Data: {
        Scorer: { Name: playerScored ? PLAYER : scorer, TeamNum: side },
        Assister: { Name: playerAssisted ? PLAYER : '' }
      },
      At: goal.at
    })
    this.told = { at: time, playerScored }
    const who = playerScored
      ? 'the player'
      : side === 0
        ? playerAssisted
          ? 'a teammate, set up by the player'
          : 'a teammate'
        : 'the other team'
    notes.push(`goal by ${who}${goal.scoreSeen ? '' : ' (the scoreboard hadn’t shown it yet)'}`)
    // Overtime, once seen, lasts until the match ends: its first goal wins it.
    if (this.overtimeTold) this.end(side, messages, notes, 'a goal in overtime')
  }

  private kickoff(time: number, messages: RocketMessage[], notes: string[]): void {
    if (time - this.kickoffAt > KICKOFF_REPEAT_MS) {
      notes.push('kickoff')
      messages.push({ Event: 'RoundStarted' })
    }
    this.kickoffAt = time
  }

  private checkEnd(time: number, messages: RocketMessage[], notes: string[]): void {
    this.checkGone(time, messages, notes)
    const clock = this.clock
    const score = this.score
    if (this.ended || !clock || !score || clock.overtime || clock.seconds !== 0) {
      this.zeroAt = null
      return
    }
    if (score[0] === score[1] || this.pending) return
    this.zeroAt ??= time
    if (time - this.zeroAt >= END_WAIT_MS) {
      this.end(score[0] > score[1] ? 0 : 1, messages, notes, 'time ran out')
    }
  }

  // The scoreboard went away while the match was on: it ended early.
  private checkGone(time: number, messages: RocketMessage[], notes: string[]): void {
    const since = this.boardGoneSince
    const score = this.score
    if (this.ended || !this.clockRan || !score || since === null || this.pending) return
    if (time - since < BOARD_GONE_MS) return
    if (score[0] === score[1]) {
      notes.push('the scoreboard went away with the score level: the result isn’t known')
      this.ended = true
      return
    }
    this.end(
      score[0] > score[1] ? 0 : 1,
      messages,
      notes,
      'the scoreboard went away early: a forfeit'
    )
  }

  private end(winner: 0 | 1, messages: RocketMessage[], notes: string[], why: string): void {
    if (this.ended) return
    this.ended = true
    notes.push(`the match ended (${why}): ${winner === 0 ? 'won' : 'lost'}`)
    messages.push({ Event: 'MatchEnded', Data: { WinnerTeamNum: winner } })
  }
}
