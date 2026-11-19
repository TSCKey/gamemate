// Short-term memory of the current match: small, structured and in memory only. It only counts
// what the companion actually saw, so every number in here is a lower bound.
import { makeEvent, type FrameReport, type GameEvent, type GameEventType } from './events'

const MAX_EVENTS = 48
const MAX_NAMES = 8
const MAX_COMMENTS = 8
const LONG_BREAK_MS = 10 * 60_000
// How long a victory or defeat screen may stay up before new play counts as a new match.
const END_SCREEN_MS = 20_000
// A kill-count banner covers the kills of about this long before it.
const BURST_MS = 20_000
// A round banner and the score changing are the same round if this close together.
const SAME_ROUND_MS = 25_000
// Low health that is gone this much later counts as having got away.
const RECOVERY_MS = 15_000
const QUICK_DEATHS_MS = 2 * 60_000
const QUICK_DEATHS = 3
const STREAK_MARKS = [3, 5, 7, 10]
const ROUND_RUN_MARKS = [3, 5, 7]
const LOSS_RUN_MARK = 3
const KILL_MILESTONES = [10, 20, 30]
// The player's kills this close together, with no death between, are one multi-kill ("double
// kill"). A feed is read every few seconds, so this is measured between the looks that saw them.
const MULTIKILL_GAP_MS = 7_000
const COMEBACK_DEFICIT = 3
const MAX_SCORE_STEP = 2

export type MatchForm = 'even' | 'good' | 'great' | 'hard'

export type MatchPattern =
  | { kind: 'same_opponent'; name: string; count: number }
  | { kind: 'same_place'; place: string; count: number }
  | { kind: 'quick_deaths'; count: number }

export interface MatchContext {
  minutes: number
  kills: number
  deaths: number
  assists: number
  killStreak: number
  bestStreak: number
  // Rounds in a row: positive when winning, negative when losing.
  roundRun: number
  score: { own: number; enemy: number } | null
  // The opponent who keeps eliminating the player, once it has happened twice.
  nemesis: { name: string; count: number } | null
  form: MatchForm
  improving: boolean
  // A repeated mistake worth a gentle word, if there is one.
  pattern: MatchPattern | null
}

interface Entry {
  time: number
  type: GameEventType
  mood: GameEvent['mood']
  kills: number
}

interface Tally {
  name: string
  count: number
  time: number
}

const combatTypes = new Set<GameEventType>([
  'kill',
  'assist',
  'headshot',
  'multikill',
  'death',
  'clutch',
  'ace',
  'team_wipe',
  'teammate_saved',
  'objective_won',
  'objective_lost',
  'round_won',
  'round_lost'
])

const key = (text: string): string => text.toLowerCase()

export class MatchMemory {
  private entries: Entry[] = []
  private opponents = new Map<string, Tally>()
  private places = new Map<string, Tally>()
  private comments: string[] = []
  private kills = 0
  private deaths = 0
  private assists = 0
  private bestStreak = 0
  private announcedStreak = 0
  private announcedKills = 0
  private roundRun = 0
  private announcedRun = 0
  private lastRound: Partial<Record<'round_won' | 'round_lost', number>> = {}
  private score: { own: number; enemy: number } | null = null
  private scoreAt = 0
  private unconfirmedScore: { own: number; enemy: number } | null = null
  private worst: { own: number; enemy: number } | null = null
  private comebackDone = false
  private lowHealthAt: number | null = null
  private endedAt: number | null = null
  private startedAt: number | null = null
  private lastFrameAt: number | null = null
  // The player's latest kills in quick succession, and how many of them were already said.
  private burst: {
    parts: { id: string; name: string; time: number }[]
    kills: number
    lastAt: number
    said: number
  } | null = null

  // Takes in one look at the game (repeats already removed) and returns what follows from it.
  // `held` lists events still on screen that were already counted.
  absorb(report: FrameReport, held: ReadonlySet<GameEventType> = new Set()): GameEvent[] {
    this.startNewMatchIfNeeded(report, held)
    this.startedAt ??= report.time
    this.lastFrameAt = Math.max(this.lastFrameAt ?? report.time, report.time)

    const kills = this.countKills(report)
    for (const event of report.events) this.count(event)

    const derived = [
      ...this.checkMultikill(report, kills),
      ...this.readScore(report),
      ...this.checkStreak(report.time, report),
      ...this.checkRecovery(report, held)
    ]
    return derived
  }

  private startNewMatchIfNeeded(report: FrameReport, held: ReadonlySet<GameEventType>): void {
    const ending =
      report.events.some((e) => e.type === 'victory' || e.type === 'defeat') ||
      held.has('victory') ||
      held.has('defeat')
    const longBreak = this.lastFrameAt !== null && report.time - this.lastFrameAt > LONG_BREAK_MS
    const playingAgain =
      this.endedAt !== null &&
      !ending &&
      report.phase === 'playing' &&
      report.time - this.endedAt > END_SCREEN_MS
    const scoreRestarted =
      report.score !== null &&
      this.score !== null &&
      report.score.own + report.score.enemy <= 1 &&
      this.score.own + this.score.enemy >= 3
    if (longBreak || playingAgain || scoreRestarted) this.startNewMatch()
  }

  private countKills(report: FrameReport): number {
    const shots = report.events.filter((e) => e.type === 'kill' || e.type === 'headshot')
    const named = new Set(shots.filter((e) => e.opponent).map((e) => key(e.opponent)))
    const nameless = (type: GameEventType): number =>
      shots.filter((e) => e.type === type && !e.opponent).length
    const counted = shots.filter((e) => e.type === 'kill').reduce((n, e) => Math.max(n, e.count), 0)
    let total = Math.max(named.size + Math.max(nameless('kill'), nameless('headshot')), counted)

    const banner = report.events.filter((e) => e.type === 'multikill')
    if (banner.length > 0) {
      const claimed = Math.max(...banner.map((e) => e.count))
      const already = this.entries
        .filter((e) => e.time < report.time && report.time - e.time <= BURST_MS)
        .reduce((n, e) => n + e.kills, 0)
      total = Math.max(total, claimed - already)
    }
    if (total > 0) {
      this.kills += total
      this.addEntry({ time: report.time, type: 'kill', mood: 'positive', kills: total })
    }
    return total
  }

  // Kills seen one after the other, a few seconds apart, from the player's own feed lines. A
  // multi-kill banner the model read says it already.
  private checkMultikill(report: FrameReport, kills: number): GameEvent[] {
    const events: GameEvent[] = []
    if (kills > 0 && !report.events.some((e) => e.type === 'multikill')) {
      const burst = this.burst
      const goesOn = burst !== null && Math.abs(report.time - burst.lastAt) <= MULTIKILL_GAP_MS
      const next = goesOn ? burst : { parts: [], kills: 0, lastAt: report.time, said: 1 }
      for (const kill of report.events.filter((e) => e.type === 'kill')) {
        next.parts.push({ id: kill.id, name: kill.opponent, time: kill.time })
      }
      // Looks can come back out of order: kept in the order they happened.
      next.parts.sort((a, b) => a.time - b.time)
      next.kills += kills
      next.lastAt = Math.max(next.lastAt, report.time)
      this.burst = next
      if (next.kills >= 2 && next.kills > next.said) {
        next.said = next.kills
        const names = next.parts.map((p) => p.name).filter((name) => name !== '')
        events.push(
          makeEvent('multikill', next.lastAt, 'memory', {
            count: next.kills,
            detail: `${next.kills} eliminations within a few seconds${names.length ? `: ${names.map((n) => `"${n}"`).join(', ')}` : ''}.`,
            related: next.parts.map((p) => p.id)
          })
        )
      }
    }
    if (report.events.some((e) => e.type === 'death')) this.burst = null
    return events
  }

  private count(event: GameEvent): void {
    switch (event.type) {
      case 'kill':
      case 'headshot':
      case 'multikill':
        return // counted together by countKills
      case 'assist':
        this.assists += 1
        break
      case 'death':
        this.deaths += 1
        this.lowHealthAt = null
        if (event.opponent) this.tally(this.opponents, event.opponent, event.time)
        if (event.place) this.tally(this.places, event.place, event.time)
        break
      case 'low_health':
        this.lowHealthAt = event.time
        break
      case 'round_won':
      case 'round_lost':
        this.noteRound(event.type, event.time)
        break
      case 'victory':
      case 'defeat':
        this.endedAt = event.time
        break
    }
    if (combatTypes.has(event.type)) {
      this.addEntry({ time: event.time, type: event.type, mood: event.mood, kills: 0 })
    }
  }

  private addEntry(entry: Entry): void {
    this.entries.push(entry)
    // Late arrivals go where they happened, so streaks stay right.
    this.entries.sort((a, b) => a.time - b.time)
    if (this.entries.length > MAX_EVENTS) this.entries.shift()
  }

  private tally(map: Map<string, Tally>, name: string, time: number): void {
    const id = key(name)
    const count = (map.get(id)?.count ?? 0) + 1
    map.set(id, { name, count, time })
    if (map.size <= MAX_NAMES) return
    let dropId = ''
    let drop: Tally | null = null
    for (const [otherId, other] of map) {
      if (otherId === id) continue
      if (
        !drop ||
        other.count < drop.count ||
        (other.count === drop.count && other.time < drop.time)
      ) {
        dropId = otherId
        drop = other
      }
    }
    map.delete(dropId)
  }

  private noteRound(type: 'round_won' | 'round_lost', time: number): void {
    this.lastRound[type] = time
    const direction = type === 'round_won' ? 1 : -1
    if (Math.sign(this.roundRun) !== direction) this.announcedRun = 0
    this.roundRun = Math.sign(this.roundRun) === direction ? this.roundRun + direction : direction
  }

  private readScore(report: FrameReport): GameEvent[] {
    const next = report.score
    if (!next || report.time < this.scoreAt) return []
    const last = this.score
    if (!last) return this.acceptScore(next, report.time, false)
    if (last.own === next.own && last.enemy === next.enemy) {
      this.unconfirmedScore = null
      return []
    }
    const ownStep = next.own - last.own
    const enemyStep = next.enemy - last.enemy
    if (ownStep >= 0 && enemyStep >= 0 && ownStep + enemyStep <= MAX_SCORE_STEP) {
      return this.acceptScore(next, report.time, true)
    }
    // An unlikely jump is probably a misread: believe it only if the next look agrees.
    const confirmed =
      this.unconfirmedScore?.own === next.own && this.unconfirmedScore.enemy === next.enemy
    this.unconfirmedScore = confirmed ? null : next
    return confirmed ? this.acceptScore(next, report.time, false) : []
  }

  private acceptScore(
    next: { own: number; enemy: number },
    time: number,
    countRounds: boolean
  ): GameEvent[] {
    const last = this.score
    this.score = next
    this.scoreAt = time
    this.unconfirmedScore = null
    if (!this.worst || next.enemy - next.own > this.worst.enemy - this.worst.own) this.worst = next

    const events: GameEvent[] = []
    if (countRounds && last) {
      const detail = `The score is now ${next.own}-${next.enemy}.`
      if (next.own > last.own) events.push(...this.roundFromScore('round_won', time, detail))
      if (next.enemy > last.enemy) events.push(...this.roundFromScore('round_lost', time, detail))
    }

    const deficit = this.worst.enemy - this.worst.own
    if (
      !this.comebackDone &&
      deficit >= COMEBACK_DEFICIT &&
      next.own >= next.enemy &&
      next.enemy >= COMEBACK_DEFICIT
    ) {
      this.comebackDone = true
      events.push(
        makeEvent('comeback', time, 'memory', {
          importance: 9,
          detail: `The score was ${this.worst.own}-${this.worst.enemy} and is now ${next.own}-${next.enemy}.`
        })
      )
    }
    return events
  }

  private roundFromScore(
    type: 'round_won' | 'round_lost',
    time: number,
    detail: string
  ): GameEvent[] {
    const banner = this.lastRound[type]
    if (banner !== undefined && Math.abs(time - banner) <= SAME_ROUND_MS) return []
    this.noteRound(type, time)
    this.addEntry({
      time,
      type,
      mood: type === 'round_won' ? 'positive' : 'negative',
      kills: 0
    })
    return [makeEvent(type, time, 'memory', { detail })]
  }

  private killStreak(): number {
    let streak = 0
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].type === 'death') break
      streak += this.entries[i].kills
    }
    return streak
  }

  private checkStreak(time: number, report: FrameReport): GameEvent[] {
    const events: GameEvent[] = []
    const streak = this.killStreak()
    this.bestStreak = Math.max(this.bestStreak, streak)
    if (streak < this.announcedStreak) this.announcedStreak = 0

    const mark = [...STREAK_MARKS].reverse().find((m) => streak >= m && m > this.announcedStreak)
    if (mark) {
      this.announcedStreak = mark
      // A banner on screen says it better than a count of what was seen.
      if (!report.events.some((e) => e.type === 'kill_streak')) {
        events.push(
          makeEvent('kill_streak', time, 'memory', {
            importance: 8,
            count: streak,
            detail: `At least ${streak} eliminations seen in a row.`
          })
        )
      }
    }

    const killMark = [...KILL_MILESTONES]
      .reverse()
      .find((m) => this.kills >= m && m > this.announcedKills)
    if (killMark) {
      this.announcedKills = killMark
      events.push(
        makeEvent('milestone', time, 'memory', {
          importance: 7,
          count: killMark,
          detail: `At least ${killMark} eliminations seen this match.`
        })
      )
    }

    events.push(...this.checkRoundRun(time))
    return events
  }

  private checkRoundRun(time: number): GameEvent[] {
    if (this.roundRun > 0) {
      const mark = [...ROUND_RUN_MARKS]
        .reverse()
        .find((m) => this.roundRun >= m && m > this.announcedRun)
      if (!mark) return []
      this.announcedRun = mark
      return [
        makeEvent('win_streak', time, 'memory', {
          importance: 8,
          count: this.roundRun,
          detail: `${this.roundRun} rounds won in a row.`
        })
      ]
    }
    // Once per run is enough: nobody needs telling again that it's going badly.
    if (-this.roundRun >= LOSS_RUN_MARK && this.announcedRun === 0) {
      this.announcedRun = LOSS_RUN_MARK
      return [
        makeEvent('loss_streak', time, 'memory', {
          importance: 7,
          count: -this.roundRun,
          detail: `${-this.roundRun} rounds lost in a row.`
        })
      ]
    }
    return []
  }

  private checkRecovery(report: FrameReport, held: ReadonlySet<GameEventType>): GameEvent[] {
    if (this.lowHealthAt === null) return []
    if (held.has('low_health') || report.events.some((e) => e.type === 'low_health')) {
      this.lowHealthAt = report.time
      return []
    }
    if (report.phase !== 'playing' || report.time - this.lowHealthAt < RECOVERY_MS) return []
    this.lowHealthAt = null
    return [
      makeEvent('recovery', report.time, 'memory', {
        importance: 5,
        detail: 'The player was very low on health and is still alive.'
      })
    ]
  }

  private form(): MatchForm {
    if (this.deaths >= 4 && this.kills * 2 <= this.deaths) return 'hard'
    if (this.roundRun <= -LOSS_RUN_MARK) return 'hard'
    if (this.kills >= 6 && this.kills >= this.deaths * 3) return 'great'
    const recent = this.entries.slice(-6)
    if (recent.length < 4) return 'even'
    const good = recent.filter((e) => e.mood === 'positive').length
    const bad = recent.filter((e) => e.mood === 'negative').length
    return good >= 4 && bad <= 1 ? 'good' : 'even'
  }

  private improving(): boolean {
    if (this.entries.length < 8) return false
    const middle = Math.floor(this.entries.length / 2)
    const share = (list: Entry[]): number =>
      list.filter((e) => e.mood === 'positive').length / list.length
    const later = share(this.entries.slice(middle))
    return later >= 0.6 && later - share(this.entries.slice(0, middle)) >= 0.34
  }

  private pattern(now: number): MatchPattern | null {
    const most = (map: Map<string, Tally>): Tally | null =>
      [...map.values()].reduce<Tally | null>((a, b) => (!a || b.count > a.count ? b : a), null)
    const opponent = most(this.opponents)
    if (opponent && opponent.count >= 2) {
      return { kind: 'same_opponent', name: opponent.name, count: opponent.count }
    }
    const place = most(this.places)
    if (place && place.count >= 2) {
      return { kind: 'same_place', place: place.name, count: place.count }
    }
    const quick = this.entries.filter(
      (e) => e.type === 'death' && now - e.time <= QUICK_DEATHS_MS
    ).length
    return quick >= QUICK_DEATHS ? { kind: 'quick_deaths', count: quick } : null
  }

  context(now: number): MatchContext {
    const nemesis = [...this.opponents.values()].reduce<Tally | null>(
      (a, b) => (!a || b.count > a.count ? b : a),
      null
    )
    return {
      minutes: this.startedAt === null ? 0 : Math.floor((now - this.startedAt) / 60_000),
      kills: this.kills,
      deaths: this.deaths,
      assists: this.assists,
      killStreak: this.killStreak(),
      bestStreak: this.bestStreak,
      roundRun: this.roundRun,
      score: this.score,
      nemesis: nemesis && nemesis.count >= 2 ? { name: nemesis.name, count: nemesis.count } : null,
      form: this.form(),
      improving: this.improving(),
      pattern: this.pattern(now)
    }
  }

  rememberComment(text: string): void {
    this.comments.push(text)
    if (this.comments.length > MAX_COMMENTS) this.comments.shift()
  }

  recentComments(): string[] {
    return [...this.comments]
  }

  size(): { events: number; opponents: number; places: number; comments: number } {
    return {
      events: this.entries.length,
      opponents: this.opponents.size,
      places: this.places.size,
      comments: this.comments.length
    }
  }

  // A new match: the numbers start over, but what was said stays so it isn't said again.
  startNewMatch(): void {
    this.entries = []
    this.opponents.clear()
    this.places.clear()
    this.kills = 0
    this.deaths = 0
    this.assists = 0
    this.bestStreak = 0
    this.announcedStreak = 0
    this.announcedKills = 0
    this.roundRun = 0
    this.announcedRun = 0
    this.lastRound = {}
    this.score = null
    this.scoreAt = 0
    this.unconfirmedScore = null
    this.worst = null
    this.comebackDone = false
    this.lowHealthAt = null
    this.endedAt = null
    this.startedAt = null
    this.lastFrameAt = null
    this.burst = null
  }

  reset(): void {
    this.startNewMatch()
    this.comments = []
  }
}
