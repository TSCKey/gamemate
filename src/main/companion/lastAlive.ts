// Whether the player is the last one alive on their team, from the alive count in the game's top
// bar (src/main/geis/adapters/teamBar.ts) and the player's own deaths and round results read on
// the same looks. Works out three moments: the player becomes the last one alive, wins the round
// that way (a clutch), or is eliminated that way.
//
// A count only changes once two looks in a row agree, so a flash or a scoreboard doesn't move
// it. During a round the count only goes down; the whole team coming back means a new round.
import { makeEvent, type GameEvent } from './events'
import { TEAM_SIZE } from '../geis/adapters/teamBar'

// Without a reading for this long, what was known about the round is forgotten.
const FORGET_MS = 60_000
// A round's result banner to the next round's start takes longer than this.
const ROUND_BREAK_MS = 15_000

const ROUND_WINS = new Set<GameEvent['type']>(['round_won', 'victory'])
const ROUND_ENDS = new Set<GameEvent['type']>(['round_won', 'round_lost', 'victory', 'defeat'])

export class LastAliveWatch {
  private alive: number | null = null
  private candidate: number | null = null
  private readAt = -Infinity
  // The player died this round.
  private died = false
  // When the round's result was seen; nothing more happens until the next round.
  private overAt: number | null = null
  // The "last one alive" moment of this round, while it is still on.
  private lastAlive: GameEvent | null = null
  private saidThisRound = false
  // More of the team was seen alive this round: only a drop to one is the moment, not a count of
  // one still showing after the round.
  private sawTeam = false

  // One look at the game: the alive count read (null when it couldn't be), and the events read on
  // the same look. Returns the moments that follow.
  absorb(time: number, count: number | null, events: readonly GameEvent[]): GameEvent[] {
    if (time - this.readAt > FORGET_MS) this.reset()
    if (this.overAt !== null && time - this.overAt > ROUND_BREAK_MS) this.newRound()
    if (count !== null) {
      this.readAt = time
      if (count === this.candidate && count !== this.alive) {
        const previous = this.alive
        this.alive = count
        // Revives bring back one player at most; a new round brings back the whole team.
        if (
          previous !== null &&
          (count - previous >= 2 || (count > previous && count === TEAM_SIZE))
        )
          this.newRound()
      }
      this.candidate = count
      if (this.alive !== null && this.alive >= 2) this.sawTeam = true
    }

    const out: GameEvent[] = []
    const over = this.overAt !== null
    const death = events.find((e) => e.type === 'death')
    const won = events.find((e) => ROUND_WINS.has(e.type))
    if (death && !this.died) {
      this.died = true
      if (this.lastAlive && !over) {
        out.push(
          makeEvent('clutch_lost', death.time, 'memory', {
            detail: 'Eliminated as the last one alive on the team.',
            opponent: death.opponent,
            related: [this.lastAlive.id, death.id]
          })
        )
      }
      this.lastAlive = null
    }
    // The game's own clutch banner says it already.
    if (won && this.lastAlive && !over && !events.some((e) => e.type === 'clutch')) {
      out.push(
        makeEvent('clutch', won.time, 'memory', {
          importance: 9,
          detail: 'Won the round as the last one alive on the team.',
          related: [this.lastAlive.id, won.id]
        })
      )
    }
    if (!over && events.some((e) => ROUND_ENDS.has(e.type))) {
      this.overAt = time
      this.lastAlive = null
    }
    if (
      this.alive === 1 &&
      this.sawTeam &&
      !this.died &&
      this.overAt === null &&
      !this.saidThisRound
    ) {
      this.saidThisRound = true
      this.lastAlive = makeEvent('last_alive', time, 'memory', {
        detail: 'The rest of the team is down; the player is the last one alive.'
      })
      out.push(this.lastAlive)
    }
    return out
  }

  private newRound(): void {
    this.died = false
    this.overAt = null
    this.lastAlive = null
    this.saidThisRound = false
    this.sawTeam = false
  }

  reset(): void {
    this.alive = null
    this.candidate = null
    this.readAt = -Infinity
    this.newRound()
  }
}
