// Short-term memory of a single-player session read off the screen: which boss the player keeps
// trying, where they keep dying, close calls and a short timeline, so a reaction can tell a
// story. Small, in memory only, and it only counts what was seen, so every number is a lower bound.
// What follows from the events as a sequence (the fifth try at a boss) is worked out by the
// sequence rules in src/main/geis/rules; this memory keeps the facts.
import type { GameEvent } from './events'

const MAX_BOSSES = 20
const MAX_AREAS = 40
const MAX_TIMELINE = 10

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
  // `time` is unused today; it keeps the same shape as match memory's absorb.
  absorb(events: GameEvent[], time: number): GameEvent[] {
    void time
    const derived: GameEvent[] = []
    for (const event of events) {
      switch (event.type) {
        case 'boss_encounter':
          this.encounter(event)
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

  private encounter(event: GameEvent): void {
    const name = event.opponent
    if (!name) return
    const id = key(name)
    const attempts = (this.bosses.get(id)?.attempts ?? 0) + 1
    // Seen again: it counts as the newest, so the oldest is what gets dropped.
    this.bosses.delete(id)
    this.bosses.set(id, { name, attempts })
    this.drop(this.bosses, MAX_BOSSES)
    this.boss = id
    this.note(`attempt ${attempts} at ${name}`)
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
    // Only the boss the screen tied the death to is blamed for it. Dying ends that fight, so the
    // next prompt no longer calls it an attempt in progress and a later death is just a death.
    const boss = event.opponent ? this.bosses.get(key(event.opponent)) : undefined
    this.boss = null
    if (boss) {
      event.count = boss.attempts
      event.detail = `died on attempt ${boss.attempts} at ${boss.name}${name ? ` in ${name}` : ''}`
    }
    this.note(boss ? `died to ${boss.name}` : name ? `died in ${name}` : 'died')
  }

  // A win off the screen is either seen (the boss's death flash) or worked out (the player left
  // the arena alive), and only the worked-out one is worded as likely.
  private win(event: GameEvent): void {
    // The attempts at the boss named on the win; the current boss only when it names none.
    const id = event.opponent ? key(event.opponent) : this.boss
    const boss = id ? this.bosses.get(id) : undefined
    const name = event.opponent || boss?.name || ''
    const attempts = boss?.attempts ?? 0
    const guessed = event.basis === 'inferred'
    if (attempts > 0) {
      event.count = attempts
      event.detail = guessed
        ? `left the arena of ${name || 'the boss'} alive on attempt ${attempts}, likely beaten`
        : `beat ${name || 'the boss'} on attempt ${attempts}`
    }
    if (guessed) this.note(name ? `likely beat ${name}` : 'likely won a hard fight')
    else this.note(name ? `beat ${name}` : 'won a hard fight')
    this.boss = null
  }

  // The player left the boss's arena with no death or win seen: the fight is over, so the next
  // prompt no longer calls it an attempt in progress. Nothing is noted, as nothing is known.
  endFight(): void {
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
