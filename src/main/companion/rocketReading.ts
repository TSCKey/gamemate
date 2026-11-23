// Rocket League, from the game's own Stats API (https://www.rocketleague.com/developer/stats-api):
// JSON messages {"Event": "...", "Data": {...}} that the game sends on a local socket once the
// player has turned the feature on. This turns them into GameMate's events, message by message.
//
// What the game says is taken as it says it: who scored, who assisted, who made a save or an epic
// save, who demolished whom, the crossbar, the clock, overtime and the result. While playing (not
// spectating) the API leaves out boost, car speed and whether the car is on the ground or a wall,
// and it never sends car positions, so no mechanic (aerial, flick, flip reset) is ever claimed.
import { makeEvent, type GameEvent } from './events'

export interface RocketMessage {
  Event: string
  Data?: Record<string, unknown>
}

interface Who {
  Name?: string
  Shortcut?: number
  TeamNum?: number
}

// What the reader knows right now, for the developer inspector.
export interface RocketState {
  matchGuid: string
  player: string | null
  team: number | null
  score: [number, number]
  timeSeconds: number | null
  overtime: boolean
}

// The last seconds that make a goal a last-second one, and the time left that makes a close match
// worth a word.
const LAST_SECOND = 5
const FINAL_SECONDS = 30
// A goal this soon after the kickoff is a kickoff goal.
const KICKOFF_GOAL_MS = 8_000
// The player's goals this close together are a quick double.
const QUICK_GOALS_MS = 60_000
// The player's saves this close together hold off one attack after another.
const STAND_MS = 20_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const who = (v: unknown): Who => (isRecord(v) ? (v as Who) : {})
const nameOf = (v: unknown): string => {
  const name = who(v).Name
  return typeof name === 'string' ? name.trim() : ''
}
const teamOf = (v: unknown): number | null => {
  const team = who(v).TeamNum
  return typeof team === 'number' && (team === 0 || team === 1) ? team : null
}
// How big a goal is depends on the moment: makeEvent takes the type's usual size.
const sized = (event: GameEvent, tier: GameEvent['tier']): GameEvent => {
  event.tier = tier
  return event
}
const same = (a: string, b: string): boolean =>
  a !== '' && a.trim().toLowerCase() === b.trim().toLowerCase()

export class RocketWatch {
  private matchGuid = ''
  private players = new Map<string, number>()
  // The player, from the names in the settings, or else the car the game is showing.
  private player: string | null = null
  private playerFromTarget = false
  private score: [number, number] = [0, 0]
  private timeSeconds: number | null = null
  private overtime = false
  private overtimeSaid = false
  private finalSaid = false
  private roundStartedAt = -Infinity
  private playerGoals: number[] = []
  private saves: { id: string; at: number }[] = []
  // The most the player's team has been behind by, for a comeback.
  private worstDeficit = 0
  // Event names the game sent that aren't read yet, for the inspector.
  readonly unknownStats = new Set<string>()

  absorb(message: RocketMessage, time: number, names: string[]): GameEvent[] {
    const data = isRecord(message.Data) ? message.Data : {}
    const guid = typeof data.MatchGuid === 'string' ? data.MatchGuid : ''
    if (guid && this.matchGuid && guid !== this.matchGuid) this.newMatch()
    if (guid) this.matchGuid = guid
    const events: GameEvent[] = []
    const add = (event: GameEvent): void => {
      event.data = { ...event.data, matchGuid: this.matchGuid }
      events.push(event)
    }
    switch (message.Event) {
      case 'MatchCreated':
      case 'MatchInitialized':
        if (message.Event === 'MatchCreated') this.newMatch()
        break
      case 'MatchDestroyed':
        this.newMatch()
        break
      case 'UpdateState':
        this.readState(data, names, time, add)
        break
      case 'ClockUpdatedSeconds':
        this.readClock(data, time, add)
        break
      case 'RoundStarted':
        this.roundStartedAt = time
        break
      case 'GoalScored':
        this.readGoal(data, time, add)
        break
      case 'StatfeedEvent':
        this.readStat(data, time, add)
        break
      case 'CrossbarHit':
        if (this.isPlayer(nameOf(isRecord(data.BallLastTouch) ? data.BallLastTouch.Player : null)))
          add(makeEvent('crossbar_hit', time, 'game'))
        break
      case 'MatchEnded':
        this.readEnd(data, time, add)
        break
    }
    return events
  }

  state(): RocketState {
    return {
      matchGuid: this.matchGuid,
      player: this.player,
      team: this.team(),
      score: [...this.score],
      timeSeconds: this.timeSeconds,
      overtime: this.overtime
    }
  }

  private newMatch(): void {
    this.matchGuid = ''
    this.players.clear()
    this.score = [0, 0]
    this.timeSeconds = null
    this.overtime = false
    this.overtimeSaid = false
    this.finalSaid = false
    this.roundStartedAt = -Infinity
    this.playerGoals = []
    this.saves = []
    this.worstDeficit = 0
    if (this.playerFromTarget) this.player = null
  }

  private team(): number | null {
    return this.player !== null ? (this.players.get(this.player.toLowerCase()) ?? null) : null
  }

  private isPlayer(name: string): boolean {
    return this.player !== null && same(name, this.player)
  }

  // [own team, other team], or null while the player's team isn't known.
  private sides(): [number, number] | null {
    const team = this.team()
    return team === null ? null : [this.score[team], this.score[1 - team]]
  }

  private readState(
    data: Record<string, unknown>,
    names: string[],
    time: number,
    add: (event: GameEvent) => void
  ): void {
    const players = Array.isArray(data.Players) ? data.Players : []
    for (const p of players) {
      const name = nameOf(p)
      const team = teamOf(p)
      if (name && team !== null) this.players.set(name.toLowerCase(), team)
    }
    const listed = [...this.players.keys()]
    const named = listed.find((n) => names.some((own) => same(own.split('#')[0], n)))
    const game = isRecord(data.Game) ? data.Game : {}
    if (named) {
      this.player = named
      this.playerFromTarget = false
    } else if (!this.player && game.bHasTarget === true && nameOf(game.Target)) {
      // Not in the settings: the car the game is showing, which while playing is the player's own.
      this.player = nameOf(game.Target).toLowerCase()
      this.playerFromTarget = true
    }
    const teams = Array.isArray(game.Teams) ? game.Teams : []
    for (const t of teams) {
      const team = teamOf(t)
      const score = isRecord(t) && typeof t.Score === 'number' ? t.Score : null
      if (team !== null && score !== null && score >= this.score[team]) this.score[team] = score
    }
    this.readClock(game, time, add)
  }

  private readClock(
    data: Record<string, unknown>,
    time: number,
    add: (event: GameEvent) => void
  ): void {
    if (typeof data.TimeSeconds === 'number') this.timeSeconds = data.TimeSeconds
    if (data.bOvertime === true) this.overtime = true
    if (this.overtime && !this.overtimeSaid) {
      this.overtimeSaid = true
      add(makeEvent('overtime_started', time, 'game', { detail: this.scoreLine() }))
    }
    const sides = this.sides()
    if (
      !this.overtime &&
      !this.finalSaid &&
      sides &&
      this.timeSeconds !== null &&
      this.timeSeconds > 0 &&
      this.timeSeconds <= FINAL_SECONDS &&
      Math.abs(sides[0] - sides[1]) <= 1
    ) {
      this.finalSaid = true
      add(
        makeEvent('final_seconds', time, 'game', {
          detail: `${this.timeSeconds} seconds left, ${this.scoreLine()}.`
        })
      )
    }
  }

  private scoreLine(): string {
    const sides = this.sides()
    return sides ? `the score is ${sides[0]}-${sides[1]} (player's team first)` : ''
  }

  private readGoal(
    data: Record<string, unknown>,
    time: number,
    add: (event: GameEvent) => void
  ): void {
    const scorer = nameOf(data.Scorer)
    const assister = nameOf(data.Assister)
    const scoringTeam = teamOf(data.Scorer)
    const before = this.sides()
    if (scoringTeam !== null) this.score[scoringTeam]++
    const after = this.sides()
    const team = this.team()
    if (team === null || before === null || after === null || scoringTeam === null) return
    const ours = scoringTeam === team
    if (!ours) {
      this.worstDeficit = Math.max(this.worstDeficit, after[1] - after[0])
    }

    // What makes this goal matter, from the score and the clock only.
    const notes: string[] = []
    if (this.overtime) notes.push('in overtime: it wins the match')
    else if (this.timeSeconds !== null && this.timeSeconds <= LAST_SECOND)
      notes.push('in the last seconds')
    if (after[0] === after[1]) notes.push('it ties the game')
    else if (ours && before[0] === before[1]) notes.push('it puts the team ahead')
    if (time - this.roundStartedAt <= KICKOFF_GOAL_MS) notes.push('straight from the kickoff')

    if (this.isPlayer(scorer)) {
      this.playerGoals.push(time)
      const count = this.playerGoals.length
      if (count === 3) notes.push('their third goal this match: a hat trick')
      else if (count > 1) notes.push(`their goal number ${count} this match`)
      const quick = this.playerGoals.filter((t) => time - t <= QUICK_GOALS_MS).length
      if (quick >= 2) notes.push('their second goal within a minute')
      if (assister) notes.push(`set up by ${assister}`)
      add(
        sized(
          makeEvent('goal_scored', time, 'game', {
            count,
            opponent: assister,
            detail: this.goalDetail(notes)
          }),
          this.overtime || notes.length >= 2 || count === 3 ? 'exceptional' : 'significant'
        )
      )
    } else if (this.isPlayer(assister)) {
      add(
        sized(
          makeEvent('goal_assist', time, 'game', {
            opponent: scorer,
            detail: this.goalDetail([`${scorer} scored it`, ...notes])
          }),
          this.overtime ? 'exceptional' : 'significant'
        )
      )
    } else if (ours) {
      add(
        sized(
          makeEvent('teammate_goal', time, 'game', {
            opponent: scorer,
            detail: this.goalDetail([`${scorer} scored it`, ...notes])
          }),
          notes.length > 0 ? 'significant' : 'minor'
        )
      )
    } else {
      add(
        sized(
          makeEvent('goal_conceded', time, 'game', {
            opponent: scorer,
            detail: this.goalDetail(notes)
          }),
          this.overtime ? 'significant' : 'minor'
        )
      )
    }
  }

  private goalDetail(notes: string[]): string {
    const line = this.scoreLine()
    return [notes.join('; '), line ? `${line[0].toUpperCase()}${line.slice(1)}.` : '']
      .filter(Boolean)
      .join('. ')
  }

  private readStat(
    data: Record<string, unknown>,
    time: number,
    add: (event: GameEvent) => void
  ): void {
    const stat = typeof data.EventName === 'string' ? data.EventName : ''
    const main = nameOf(data.MainTarget)
    const second = nameOf(data.SecondaryTarget)
    switch (stat) {
      case 'Save':
      case 'EpicSave': {
        if (!this.isPlayer(main)) return
        const save = makeEvent(stat === 'EpicSave' ? 'epic_save' : 'save', time, 'game')
        add(save)
        this.saves = [
          ...this.saves.filter((s) => time - s.at <= STAND_MS),
          { id: save.id, at: time }
        ]
        if (this.saves.length >= 2) {
          add(
            makeEvent('defensive_stand', time, 'memory', {
              count: this.saves.length,
              detail: `${this.saves.length} saves within a few seconds.`,
              related: this.saves.map((s) => s.id)
            })
          )
        }
        return
      }
      case 'Demolish':
        if (this.isPlayer(main)) add(makeEvent('demolition', time, 'game', { opponent: second }))
        else if (this.isPlayer(second))
          add(makeEvent('demolished', time, 'game', { opponent: main }))
        return
      // Told by GoalScored, which says more; a shot alone isn't worth a word.
      case 'Goal':
      case 'Assist':
      case 'Shot':
        return
      default:
        if (stat) this.unknownStats.add(stat)
    }
  }

  private readEnd(
    data: Record<string, unknown>,
    time: number,
    add: (event: GameEvent) => void
  ): void {
    const winner = typeof data.WinnerTeamNum === 'number' ? data.WinnerTeamNum : null
    const team = this.team()
    const sides = this.sides()
    if (winner === null || team === null) return
    const won = winner === team
    const line = this.scoreLine()
    if (won && this.worstDeficit >= 2) {
      add(
        makeEvent('comeback', time, 'game', {
          detail: `Won after being ${this.worstDeficit} goals behind. ${line}`.trim(),
          importance: 10
        })
      )
    }
    add(
      makeEvent(won ? 'victory' : 'defeat', time, 'game', {
        detail: sides ? `Final score ${sides[0]}-${sides[1]} (player's team first).` : ''
      })
    )
  }
}
