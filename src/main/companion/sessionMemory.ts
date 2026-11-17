// Short-term memory of a single-player session read off the screen: which boss the player keeps
// trying, where they keep dying, close calls and a short timeline, so a reaction can tell a
// story. Small, in memory only, and it only counts what was seen, so every number is a lower bound.
import { makeEvent, type GameEvent } from './events'

const MAX_BOSSES = 20
const MAX_AREAS = 40
const MAX_TIMELINE = 10
// Attempt numbers worth a moment of their own.
const ATTEMPT_MILESTONES = [5, 10, 20]

export interface SessionContext {
  boss: { name: string; attempt: number } | null
  deathsHere: number
  area: string | null
  closeCalls: number
  areasVisited: number
  // Short English facts, newest last.
  timeline: string[]
}

const key = (text: string): string => text.toLowerCase()

export class SessionMemory {
  private bosses = new Map<string, { name: string; attempts: number }>()
  private areas = new Map<string, { name: string; deaths: number }>()
  private boss: string | null = null
  private area: string | null = null
  private closeCalls = 0
  private timeline: string[] = []

  // Takes in what the screen showed (repeats already removed) and returns what follows from it.
  absorb(events: GameEvent[], time: number): GameEvent[] {
    const derived: GameEvent[] = []
    for (const event of events) {
      switch (event.type) {
        case 'boss_encounter':
          derived.push(...this.encounter(event, time))
          break
        case 'area_entered':
          this.enter(event)
          break
        case 'death':
          this.die(event)
          break
        case 'low_health':
          this.closeCalls += 1
          this.note('nearly died')
          break
        case 'fight_won':
          this.win(event)
          break
      }
    }
    return derived
  }

  private encounter(event: GameEvent, time: number): GameEvent[] {
    const name = event.opponent
    if (!name) return []
    const id = key(name)
    const attempts = (this.bosses.get(id)?.attempts ?? 0) + 1
    // Seen again: it counts as the newest, so the oldest is what gets dropped.
    this.bosses.delete(id)
    this.bosses.set(id, { name, attempts })
    this.drop(this.bosses, MAX_BOSSES)
    this.boss = id
    this.note(`attempt ${attempts} at ${name}`)
    if (!ATTEMPT_MILESTONES.includes(attempts)) return []
    return [
      makeEvent('milestone', time, 'memory', {
        importance: 8,
        count: attempts,
        opponent: name,
        detail: `attempt ${attempts} at ${name}`
      })
    ]
  }

  private enter(event: GameEvent): void {
    if (!event.place) return
    const id = key(event.place)
    const deaths = this.areas.get(id)?.deaths ?? 0
    this.areas.delete(id)
    this.areas.set(id, { name: event.place, deaths })
    this.drop(this.areas, MAX_AREAS)
    this.area = id
    // A new place means the fight there is over.
    this.boss = null
    this.note(`entered ${event.place}`)
  }

  private die(event: GameEvent): void {
    // The screen names the area it was in; otherwise it is the one the player last entered.
    const name = event.place || this.areas.get(this.area ?? '')?.name || ''
    if (name) {
      const id = key(name)
      const area = this.areas.get(id) ?? { name, deaths: 0 }
      this.areas.delete(id)
      this.areas.set(id, { name: area.name, deaths: area.deaths + 1 })
      this.drop(this.areas, MAX_AREAS)
      this.area = id
    }
    const boss = this.boss ? this.bosses.get(this.boss) : undefined
    this.note(boss ? `died to ${boss.name}` : name ? `died in ${name}` : 'died')
  }

  // A win off the screen is worked out (the player left the arena alive), never seen, so it is
  // only ever worded as likely.
  private win(event: GameEvent): void {
    const boss = this.boss ? this.bosses.get(this.boss) : undefined
    const name = event.opponent || boss?.name || ''
    const attempts = boss?.attempts ?? 0
    if (attempts > 0) {
      event.count = attempts
      event.detail = `left the arena of ${name || 'the boss'} alive on attempt ${attempts}, likely beaten`
    }
    this.note(name ? `likely beat ${name}` : 'likely won a hard fight')
    this.boss = null
  }

  private note(fact: string): void {
    this.timeline.push(fact)
    if (this.timeline.length > MAX_TIMELINE) this.timeline.shift()
  }

  // Forgets the oldest entries beyond the limit.
  private drop(map: Map<string, unknown>, max: number): void {
    while (map.size > max) {
      const oldest = map.keys().next().value
      if (oldest === undefined) return
      map.delete(oldest)
    }
  }

  // `now` is unused today; it keeps the same shape as match memory's context.
  context(now: number): SessionContext {
    void now
    const boss = this.boss ? this.bosses.get(this.boss) : undefined
    const area = this.area ? this.areas.get(this.area) : undefined
    return {
      boss: boss ? { name: boss.name, attempt: boss.attempts } : null,
      deathsHere: area?.deaths ?? 0,
      area: area?.name ?? null,
      closeCalls: this.closeCalls,
      areasVisited: this.areas.size,
      timeline: [...this.timeline]
    }
  }

  size(): { bosses: number; areas: number } {
    return { bosses: this.bosses.size, areas: this.areas.size }
  }

  reset(): void {
    this.bosses.clear()
    this.areas.clear()
    this.boss = null
    this.area = null
    this.closeCalls = 0
    this.timeline = []
  }
}
