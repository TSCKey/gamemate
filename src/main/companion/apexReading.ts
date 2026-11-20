// Apex Legends, read off its HUD with the text reader (src/main/ocr), look by look. Only what the
// HUD writes out is taken, measured on the owner's clips (English client):
// - the kill feed: "<attacker> [Bleed Out] <victim>" and "[Finisher]" are eliminations; any other
//   line is a knock or an elimination, which can't be told apart; "Enemy Shield Broken - <legend>";
//   "<name> is the new Kill Leader with <n> kills."; "<n> SQUADS LEFT"; "AWAITING RESPAWN";
// - the middle of the screen: "KNOCKED DOWN <name> +150", the player's own knock;
// - the bottom: "Knockdown Shield", the player is knocked;
// - the squad panel: the teammates' names, "DELIVER TO BEACON" (the player's banner was picked up)
//   and "DEATHBOX RECOVERY" (a teammate's banner can be);
// - the ring line under the minimap: "ROUND 1 - CLOSING";
// - the top: "CHAMPION SQUAD"; and "Requeue Party" once the squad is out.
//
// A knock is never taken for an elimination, nothing is counted that isn't written, and no number
// is made up. What follows from several looks (two knocks in a row, a squad wiped, a third squad
// in the fight) is worked out here; a fight's outcome is told by the apexEngagement rule.
import { lines } from '../ocr/feedText'
import type { OcrSegment } from '../ocr/paddleOcr'
import { makeEvent, type FrameReport, type GameEvent } from './events'
import { ARMOUR_SHIELD, type PlayerBars, type TeammateState } from '../geis/adapters/apexBars'

export interface ApexRead {
  feed: OcrSegment[]
  center: OcrSegment[]
  bottom: OcrSegment[]
  top: OcrSegment[]
  // Read less often: null when this look didn't read it.
  team: OcrSegment[] | null
  ring: OcrSegment[] | null
  // The health and shield bars and the teammates' cards, by their colours, read on every look:
  // the player's bars (null when not on screen), and the teammates' states, nearest card first.
  bars?: { player: PlayerBars | null; teammates: (TeammateState | null)[] }
}

// What the reader knows right now, for the developer inspector.
export interface ApexState {
  health: number | null
  shield: number | null
  armour: string | null
  teammates: { name: string; state: TeammateState | null }[]
  squadsLeft: number | null
  inFight: boolean
}

// The player's health at or under this share, with no shield left, is critical.
const CRITICAL_HEALTH = 30
const CRITICAL_SHIELD = 5
// Back up to this share of health after a critical moment is a recovery.
const RECOVERED_HEALTH = 70
// Health and shield together lost within the window: heavy damage.
const HEAVY_DAMAGE = 100
const HEAVY_DAMAGE_MS = 8_000
// A shield back to full this long after it broke is worth a word.
const SHIELD_MEMORY_MS = 120_000
// After a death recap, summary or spectating screen, the squad's cards aren't the squad's.
const SCREEN_MS = 6_000
// A teammate seen down in the feed this recently is the same as their card going down.
const FEED_DOWN_MS = 10_000

// A line read on one look is still up for several more.
const LINE_MEMORY_MS = 40_000
// The player's knocks this close together are one burst.
const MULTI_KNOCK_GAP_MS = 10_000
// Combat this recent means a fight is on: comments that can wait, wait.
const FIGHT_MS = 10_000
// A fight with nothing new for this long is over.
const ENGAGEMENT_MS = 25_000
// A squad's elimination this close before the squad count drops is the squad that went.
const WIPE_MS = 15_000
const FINAL_SQUADS = 3
// A screen gone for this long and back is a new time it happened.
const AGAIN_MS = 20_000
// The player's feed line for a knock shows up with the knock notice.
const KNOCK_LINE_MS = 8_000
const MAX_NAME = 32

// Apex's legends, for telling "Enemy Shield Broken - Dctane" is Octane. A name that isn't close to
// one of them (a line cut short, or a new legend) is no legend.
const LEGENDS = [
  'Alter',
  'Ash',
  'Axle',
  'Ballistic',
  'Bangalore',
  'Bloodhound',
  'Catalyst',
  'Caustic',
  'Conduit',
  'Crypto',
  'Fuse',
  'Gibraltar',
  'Horizon',
  'Lifeline',
  'Loba',
  'Mad Maggie',
  'Mirage',
  'Newcastle',
  'Octane',
  'Pathfinder',
  'Rampart',
  'Revenant',
  'Seer',
  'Sparrow',
  'Valkyrie',
  'Vantage',
  'Wattson',
  'Wraith'
]

export function legendName(read: string): string | null {
  const shown = plain(read)
  let best = ''
  let bestDistance = Infinity
  for (const legend of LEGENDS) {
    const distance = editDistance(plain(legend), shown)
    if (distance < bestDistance) {
      best = legend
      bestDistance = distance
    }
  }
  return bestDistance <= Math.max(1, Math.floor(shown.length / 3)) ? best : null
}

// Names seen in one fight, each once however OCR spelled it.
class NameSet {
  private names: string[] = []
  add(name: string): void {
    if (!this.names.some((n) => sameName(n, name))) this.names.push(name)
  }
  get size(): number {
    return this.names.length
  }
}

type Who = 'player' | 'team' | 'other'

interface FeedLine {
  attacker: string
  victim: string
  // "[Bleed Out]" or "[Finisher]": the victim was eliminated.
  eliminated: boolean
}

// Letters and digits only, lower case: OCR's spacing and punctuation vary from look to look.
const plain = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = kept
    }
  }
  return row[b.length]
}

// The longest run of letters two names share.
function longestRun(a: string, b: string): number {
  let best = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++
      if (k > best) best = k
    }
  }
  return best
}

// The same name read twice: OCR misreads a letter or two ("TSCkey", "TSCkay", "TSCkBy").
export function sameName(a: string, b: string): boolean {
  const x = plain(a)
  const y = plain(b)
  if (x.length < 3 || y.length < 3) return x !== '' && x === y
  if (x === y) return true
  const longer = Math.max(x.length, y.length)
  if (longer >= 6 && (x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) >= 4)
    return true
  return editDistance(x, y) <= Math.max(1, Math.floor(longer / 5))
}

const cleanName = (text: string): string =>
  text
    .replace(/^[\s:;.,'"`|]+|[\s:;.,'"`|]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME)

const rowText = (row: OcrSegment[]): string =>
  row
    .map((s) => s.text.trim())
    .join(' ')
    .trim()

// What isn't a kill-feed line: pings, the performance read-out, counters and screens.
const NOT_A_LINE =
  /spotted|suggested|enemy audio|squads?\s*left|requeue|awaiting|respawn|\bfps\b|\bping\b|\brp\b|kill\s*leader|shield\s*broken/i
const ELIMINATED = /\[\s*(bleed\s*out|finisher)\s*\]/i

// One kill-feed row as attacker and victim, or null when it isn't such a line.
export function feedLine(row: OcrSegment[]): FeedLine | null {
  const text = rowText(row)
  if (!text || NOT_A_LINE.test(text)) return null
  const tag = ELIMINATED.exec(text)
  if (tag) {
    const attacker = cleanName(text.slice(0, tag.index))
    const victim = cleanName(text.slice(tag.index + tag[0].length))
    return attacker && victim ? { attacker, victim, eliminated: true } : null
  }
  // "attacker <weapon icon> victim": the weapon is the widest gap. A bracket after the attacker
  // names the weapon or ability ("[The Motherlode]").
  if (row.length < 2) return null
  let split = 1
  let widest = -Infinity
  for (let i = 1; i < row.length; i++) {
    const gap = row[i].x - (row[i - 1].x + row[i - 1].width)
    if (gap > widest) {
      widest = gap
      split = i
    }
  }
  const attacker = cleanName(rowText(row.slice(0, split)).replace(/\s*\[[^\]]*\]?\s*$/, ''))
  const victim = cleanName(rowText(row.slice(split)))
  if (plain(attacker).length < 3 || plain(victim).length < 3) return null
  return { attacker, victim, eliminated: false }
}

// The teammates' names in the squad panel: the names above the player's own row, which carries the
// level ("NEXT LVL: 769 EVO", "MAX LEVEL").
export function rosterFrom(team: OcrSegment[], player: string[]): string[] | null {
  const rows = lines(team)
  const own = rows.findIndex((row) => /next\s*lvl|\bevo\b|max\s*level/i.test(rowText(row)))
  if (own < 0) return null
  return rows
    .slice(0, own)
    .map((row) => cleanName(rowText(row)))
    .filter(
      (name) =>
        plain(name).length >= 3 &&
        !/deliver|beacon|deathbox|recover|level|\bevo\b|backpack|attachment/i.test(name) &&
        !player.some((p) => sameName(p, name))
    )
}

interface Engagement {
  startedAt: number
  lastAt: number
  enemies: NameSet
  legends: NameSet
  thirdPartySaid: boolean
}

export class ApexWatch {
  private roster: string[] = []
  private recentLines: { line: FeedLine; at: number }[] = []
  // The player's knocks of the last few seconds; `unmatched`: read off the notice and not yet
  // matched to the player's feed line.
  private knocks: { name: string; at: number; fromFeed: boolean; unmatched: boolean }[] = []
  private burst: { ids: string[]; at: number; said: number } | null = null
  private squadsLeft: number | null = null
  private squadsCandidate: number | null = null
  private finalSquadsSaid = false
  private lastSquadElimination = -Infinity
  private lastCombat = -Infinity
  private engagement: Engagement | null = null
  private teammatesDown = new Map<string, number>()
  private lastRing: { round: string; at: number } | null = null
  private seenAt: Record<'knocked' | 'awaiting' | 'beacon' | 'champion' | 'requeue', number> = {
    knocked: -Infinity,
    awaiting: -Infinity,
    beacon: -Infinity,
    champion: -Infinity,
    requeue: -Infinity
  }
  private killLeaderSaid = 0
  // The player's bars: the last reading, the last few seconds of health and shield together,
  // whether health is critical, and when the shield last broke.
  private bars: PlayerBars | null = null
  private recentHealth: { at: number; effective: number }[] = []
  private critical = false
  private shieldBrokenAt = -Infinity
  private heavyAt = -Infinity
  // The teammates' cards, nearest the player's first.
  private cards: { state: TeammateState | null; candidate: TeammateState | null }[] = []
  private feedDownAt = -Infinity
  private screenAt = -Infinity
  // Who last knocked or eliminated the player, and when the player last died.
  private downedBy: { name: string; at: number } | null = null
  private diedAt = -Infinity
  // The player's own kill-feed lines of the last few seconds (knocks and eliminations).
  private playerLines: { victim: string; at: number }[] = []

  // One look: what was read, when, and the player's in-game names (from the settings).
  absorb(read: ApexRead, time: number, player: string[]): FrameReport {
    if (read.team) {
      const roster = rosterFrom(read.team, player)
      if (roster && roster.length > 0) this.roster = roster
    }
    const who = (name: string): Who =>
      player.some((p) => sameName(p, name))
        ? 'player'
        : this.roster.some((t) => sameName(t, name))
          ? 'team'
          : 'other'

    const events: GameEvent[] = []
    const add = (event: GameEvent): void => {
      events.push(event)
    }

    this.readFeed(read.feed, time, who, add)
    this.readKnock(read.center, time, add)
    this.readScreens(read, time, add)
    this.readSquads(read.feed, time, add)
    if (read.ring) this.readRing(read.ring, time, add)
    // The bars and cards only count while the player's own HUD is up: not over a death recap, a
    // summary or while spectating after being eliminated.
    const screen =
      read.feed.some((s) => /killer|requeue|awaiting/i.test(s.text)) ||
      read.top.some((s) => /summary|spectate/i.test(s.text))
    if (screen) this.screenAt = time
    if (read.bars && time - this.screenAt > SCREEN_MS) {
      this.readPlayerBars(read.bars.player, time, add)
      this.readTeammates(read.bars.teammates, time, add)
    }

    const combat = events.some((e) => COMBAT.has(e.type))
    if (combat) this.lastCombat = time
    if (this.engagement && time - this.engagement.lastAt > ENGAGEMENT_MS) this.engagement = null
    this.checkThirdParty(time, add)

    const ended = events.some((e) => e.type === 'victory' || e.type === 'defeat')
    if (ended) this.endMatch()
    return {
      time,
      source: 'vision',
      adapterId: 'apex',
      phase: ended ? 'intermission' : 'playing',
      inFight: time - this.lastCombat < FIGHT_MS,
      score: null,
      description: '',
      events
    }
  }

  // The rest of the squad is down: every teammate's card shows them knocked or eliminated, or
  // (without their cards) every teammate was seen going down in this fight.
  private alone(): boolean {
    const cards = this.cards.filter((c) => c.state !== null)
    if (cards.length > 0) return cards.every((c) => c.state !== 'alive')
    return this.roster.length > 0 && this.teammatesDown.size >= this.roster.length
  }

  // What the reader knows right now, for the developer inspector.
  state(time: number): ApexState {
    const bars = this.bars
    return {
      health: bars?.health ?? null,
      shield: bars?.shield ?? null,
      armour: bars?.armour ?? null,
      teammates: this.cards.map((card, slot) => ({ name: this.slotName(slot), state: card.state })),
      squadsLeft: this.squadsLeft,
      inFight: time - this.lastCombat < FIGHT_MS
    }
  }

  // Cards are nearest the player's first; the squad panel lists names top to bottom.
  private slotName(slot: number): string {
    return this.roster[this.roster.length - 1 - slot] ?? ''
  }

  private readPlayerBars(
    bars: PlayerBars | null,
    time: number,
    add: (event: GameEvent) => void
  ): void {
    if (!bars) return
    const before = this.bars
    this.bars = bars
    // An unreadable shield (null) leaves health alone to go on: no shield moments, and damage
    // counted from health only.
    const shield = bars.shield
    const beforeShield = before?.shield ?? null
    const effective = bars.health + (shield ?? 0)
    this.recentHealth = this.recentHealth.filter((h) => time - h.at <= HEAVY_DAMAGE_MS)
    const peak = Math.max(effective, ...this.recentHealth.map((h) => h.effective))
    this.recentHealth.push({ at: time, effective })

    const critical =
      bars.health <= CRITICAL_HEALTH && (shield === null || shield <= CRITICAL_SHIELD)
    if (critical && !this.critical) {
      this.critical = true
      this.engage(time)
      add(
        makeEvent('low_health', time, 'screen', {
          detail: 'Health is critical and the shield is gone.',
          confidence: 0.9
        })
      )
    } else if (beforeShield !== null && beforeShield >= 15 && shield === 0 && bars.health > 0) {
      this.engage(time)
      add(makeEvent('player_shield_broken', time, 'screen', { confidence: 0.9 }))
    }
    if (this.critical && bars.health >= RECOVERED_HEALTH) {
      this.critical = false
      add(
        makeEvent('recovery', time, 'screen', {
          detail: 'Back to most of their health after being critical.',
          confidence: 0.9
        })
      )
    }
    if (
      shield !== null &&
      beforeShield !== null &&
      peak - effective >= HEAVY_DAMAGE &&
      !critical &&
      time - this.heavyAt > HEAVY_DAMAGE_MS * 2
    ) {
      this.heavyAt = time
      this.engage(time)
      add(makeEvent('heavy_damage', time, 'screen', { confidence: 0.8 }))
    }
    if (shield === 0) this.shieldBrokenAt = time
    const full = bars.armour ? ARMOUR_SHIELD[bars.armour] : Infinity
    if (
      time - this.shieldBrokenAt < SHIELD_MEMORY_MS &&
      shield !== null &&
      shield >= full * 0.95 &&
      beforeShield !== null &&
      beforeShield < full * 0.95
    ) {
      this.shieldBrokenAt = -Infinity
      add(makeEvent('shields_restored', time, 'screen', { confidence: 0.9 }))
    }
  }

  // Each card's state changes once two looks in a row agree, and only its changes are told:
  // knocked, back up (revived), eliminated, back in the match (respawned).
  private readTeammates(
    states: (TeammateState | null)[],
    time: number,
    add: (event: GameEvent) => void
  ): void {
    states.forEach((seen, slot) => {
      const card = (this.cards[slot] ??= { state: null, candidate: null })
      if (seen === null || seen === card.state) {
        card.candidate = null
        return
      }
      if (seen !== card.candidate) {
        card.candidate = seen
        return
      }
      card.candidate = null
      const was = card.state
      card.state = seen
      if (was === null) return
      const name = this.slotName(slot)
      const who = name ? `Teammate ${name}` : 'A teammate'
      const fromFeed = time - this.feedDownAt < FEED_DOWN_MS
      const fields = { opponent: name, confidence: 0.9 }
      if (seen === 'knocked' && was === 'alive') {
        this.engage(time)
        if (name) this.teammatesDown.set(plain(name), time)
        if (!fromFeed) {
          add(
            makeEvent('teammate_down', time, 'screen', {
              ...fields,
              detail: `${who} was knocked down.`,
              data: { state: 'knocked', alone: this.alone() }
            })
          )
        }
      } else if (seen === 'eliminated') {
        if (name) this.teammatesDown.set(plain(name), time)
        if (!fromFeed && was === 'alive') {
          add(
            makeEvent('teammate_down', time, 'screen', {
              ...fields,
              detail: `${who} was eliminated.`,
              data: { state: 'eliminated', alone: this.alone() }
            })
          )
        }
      } else if (seen === 'alive' && was === 'knocked') {
        if (name) this.teammatesDown.delete(plain(name))
        add(
          makeEvent('teammate_revived', time, 'screen', {
            ...fields,
            detail: `${who} was revived.`
          })
        )
      } else if (seen === 'alive' && was === 'eliminated') {
        if (name) this.teammatesDown.delete(plain(name))
        add(
          makeEvent('teammate_respawned', time, 'screen', {
            ...fields,
            detail: `${who} is back in the match.`
          })
        )
      }
    })
  }

  private engage(time: number): Engagement {
    if (!this.engagement || time - this.engagement.lastAt > ENGAGEMENT_MS) {
      this.engagement = {
        startedAt: time,
        lastAt: time,
        enemies: new NameSet(),
        legends: new NameSet(),
        thirdPartySaid: false
      }
      this.teammatesDown.clear()
    }
    this.engagement.lastAt = time
    return this.engagement
  }

  private isNewLine(line: FeedLine, time: number): boolean {
    this.recentLines = this.recentLines.filter((l) => time - l.at < LINE_MEMORY_MS)
    const known = this.recentLines.some(
      (l) =>
        l.line.eliminated === line.eliminated &&
        sameName(l.line.attacker, line.attacker) &&
        sameName(l.line.victim, line.victim)
    )
    if (!known) this.recentLines.push({ line, at: time })
    return !known
  }

  private readFeed(
    feed: OcrSegment[],
    time: number,
    who: (name: string) => Who,
    add: (event: GameEvent) => void
  ): void {
    for (const row of lines(feed)) {
      const text = rowText(row)
      const shield = /enemy\s*shield\s*broken\s*[-–—]?\s*(.+)$/i.exec(text)
      if (shield) {
        const read = cleanName(shield[1])
        const legend = legendName(read)
        // A shield message stays a few seconds; the same legend's again later is a new one.
        const line = { attacker: '', victim: `shield:${legend ?? read}`, eliminated: false }
        if (read && this.isNewLine(line, time)) {
          // Only a legend known by name counts towards how many enemies there are: a line cut
          // short ("Vara") could be any of them.
          if (legend) this.engage(time).legends.add(legend)
          else this.engage(time)
          add(
            makeEvent('shield_break', time, 'vision', { opponent: legend ?? '', confidence: 0.9 })
          )
        }
        continue
      }
      const leader = /^(.+?)\s+is\s+the\s+new\s+kill\s*leader\s+with\s*(\d+)\s*kills/i.exec(text)
      if (leader) {
        const kills = Number(leader[2])
        if (who(leader[1]) === 'player' && kills > this.killLeaderSaid) {
          this.killLeaderSaid = kills
          add(
            makeEvent('kill_leader', time, 'vision', {
              count: kills,
              detail: `The game says the player is the new kill leader with ${kills} kills.`,
              confidence: 0.9
            })
          )
        }
        continue
      }
      const line = feedLine(row)
      if (!line || !this.isNewLine(line, time)) continue
      this.readLine(line, time, who, add)
    }
  }

  private readLine(
    line: FeedLine,
    time: number,
    who: (name: string) => Who,
    add: (event: GameEvent) => void
  ): void {
    const attacker = who(line.attacker)
    const victim = who(line.victim)
    if (attacker !== 'other' && victim !== 'other') return
    const ours = attacker !== 'other' || victim !== 'other'
    if (!ours) return
    const fight = this.engage(time)
    if (attacker !== 'other') fight.enemies.add(line.victim)
    if (victim !== 'other') fight.enemies.add(line.attacker)
    if (attacker === 'player' && !line.eliminated) {
      this.playerLines.push({ victim: line.victim, at: time })
    }
    if (attacker === 'player' && !line.eliminated) {
      this.playerDowned(line.victim, time, add, true)
      return
    }

    if (line.eliminated && attacker !== 'other') this.lastSquadElimination = time
    if (line.eliminated && attacker === 'player') {
      add(
        makeEvent('kill', time, 'vision', {
          opponent: line.victim,
          detail: `Eliminated ${line.victim} (the kill feed says so).`,
          confidence: 0.9,
          data: { alone: this.alone() }
        })
      )
    } else if (victim === 'player') {
      this.downedBy = { name: line.attacker, at: time }
      if (!line.eliminated) return
      this.diedAt = time
      add(
        makeEvent('death', time, 'vision', {
          opponent: line.attacker,
          detail: `Eliminated by ${line.attacker}.`,
          confidence: 0.9
        })
      )
    } else if (victim === 'team') {
      this.teammatesDown.set(plain(line.victim), time)
      this.feedDownAt = time
      add(
        makeEvent('teammate_down', time, 'vision', {
          opponent: line.victim,
          detail: line.eliminated
            ? `Teammate ${line.victim} was eliminated by ${line.attacker}.`
            : `Teammate ${line.victim} went down to ${line.attacker}.`,
          confidence: 0.9,
          data: { eliminated: line.eliminated, alone: this.alone() }
        })
      )
    }
  }

  // The player's own knock, written in the middle of the screen for a few seconds.
  // The player's own knock, written in the middle of the screen for two or three seconds.
  private readKnock(center: OcrSegment[], time: number, add: (event: GameEvent) => void): void {
    for (const row of lines(center)) {
      const knock = /knocked\s*down\s*(.*)$/i.exec(rowText(row))
      if (!knock) continue
      // The points come after the name ("+150"); a name can end in digits itself.
      const name = cleanName(knock[1].replace(/\s*\+.*$/, '').replace(/\s+\d{2,3}$/, ''))
      if (plain(name).length >= 2) this.playerDowned(name, time, add, false)
    }
  }

  // The player knocked someone: from the notice in the middle of the screen, or from the player's
  // own kill-feed line, which stays up longer (a notice can come and go between two looks). Both
  // for the same knock are one knock. A plain feed line can also be an elimination with no knock
  // first (a squad's last player): it is only ever called a knock, never more than it was.
  private playerDowned(
    name: string,
    time: number,
    add: (event: GameEvent) => void,
    fromFeed: boolean
  ): void {
    this.knocks = this.knocks.filter((k) => time - k.at < AGAIN_MS)
    const resolved = fromFeed ? name : this.feedSpelling(name, time)
    const known = this.knocks.find((k) => sameName(k.name, resolved))
    if (known) {
      known.at = time
      return
    }
    // A notice whose name couldn't be matched to the feed is the knock this feed line is about.
    const unmatched = fromFeed
      ? this.knocks.find((k) => !k.fromFeed && k.unmatched && time - k.at < KNOCK_LINE_MS)
      : undefined
    if (unmatched) {
      unmatched.name = name
      unmatched.unmatched = false
      return
    }
    this.knocks.push({
      name: resolved,
      at: time,
      fromFeed,
      unmatched: !fromFeed && resolved === name && !this.playerLines.length
    })
    this.engage(time).enemies.add(resolved)
    const knockEvent = makeEvent('knock', time, 'vision', {
      opponent: resolved,
      detail: `Knocked down ${resolved}.`,
      confidence: 0.9,
      data: { alone: this.alone() }
    })
    add(knockEvent)
    const burst = this.burst
    const goesOn = burst !== null && time - burst.at <= MULTI_KNOCK_GAP_MS
    const next = goesOn ? burst : { ids: [], at: time, said: 1 }
    next.ids.push(knockEvent.id)
    next.at = time
    this.burst = next
    if (next.ids.length >= 2 && next.ids.length > next.said) {
      next.said = next.ids.length
      add(
        makeEvent('multi_knock', time, 'memory', {
          count: next.ids.length,
          detail: `${next.ids.length} knocks within a few seconds.`,
          related: [...next.ids]
        })
      )
    }
  }

  // The feed writes a name as it is; the middle of the screen in capitals, and its OCR is often off
  // by a few letters ("HEYZ" for "ID_Keyzz"). The player's own feed line for the same knock says
  // who it was: the closest name of the last few seconds, or the only one.
  private feedSpelling(name: string, time: number): string {
    this.playerLines = this.playerLines.filter((l) => time - l.at < KNOCK_LINE_MS)
    const shown = plain(name)
    let best: string | null = null
    let bestShare = Infinity
    for (const line of this.playerLines) {
      const victim = plain(line.victim)
      // A notice cut short or misread at the start still shares a run of letters ("WAAKI" and
      // "Li77waakk").
      const shared = longestRun(victim, shown) / Math.min(victim.length, shown.length)
      const share =
        shown.length >= 4 && shared >= 0.6
          ? 0
          : editDistance(victim, shown) / Math.max(victim.length, shown.length)
      if (share < bestShare) {
        best = line.victim
        bestShare = share
      }
    }
    if (best && bestShare <= 0.5) return best
    const recent = this.playerLines.filter((l) => time - l.at < 4_000)
    return recent.length === 1 ? recent[0].victim : name
  }

  private readScreens(read: ApexRead, time: number, add: (event: GameEvent) => void): void {
    const has = (segments: OcrSegment[] | null, pattern: RegExp): boolean =>
      !!segments && segments.some((s) => pattern.test(s.text))
    // Each fires when it shows up, not on every look it stays.
    const appears = (key: keyof ApexWatch['seenAt'], showing: boolean): boolean => {
      const fresh = showing && time - this.seenAt[key] > AGAIN_MS
      if (showing) this.seenAt[key] = time
      return fresh
    }
    if (appears('knocked', has(read.bottom, /knockdown\s*shield/i))) {
      this.engage(time)
      add(makeEvent('player_knocked', time, 'vision', { confidence: 0.9 }))
    }
    if (appears('awaiting', has(read.feed, /awaiting\s*respawn/i))) {
      // Said once per life: an elimination already read off the feed is the same death.
      if (time - this.diedAt > AGAIN_MS) {
        const by = this.downedBy && time - this.downedBy.at < 60_000 ? this.downedBy.name : ''
        add(
          makeEvent('death', time, 'vision', {
            opponent: by,
            detail: 'The player was eliminated and is waiting to be respawned.',
            confidence: 0.9
          })
        )
      }
      this.diedAt = time
    }
    if (appears('beacon', has(read.team, /deliver\s*to\s*beacon/i))) {
      add(makeEvent('banner_recovered', time, 'vision', { confidence: 0.9 }))
    }
    if (read.team && has(read.team, /deathbox\s*recovery|recover\s*\d/i)) {
      // A teammate's banner can be picked up: one of the squad is out of this fight.
      const label = `banner:${this.teammatesDown.size}`
      if (this.teammatesDown.size < this.roster.length && !this.teammatesDown.has(label))
        this.teammatesDown.set(label, time)
    }
    if (appears('champion', has(read.top, /champion/i))) {
      add(makeEvent('victory', time, 'vision', { detail: 'Champion squad.', importance: 10 }))
    }
    if (appears('requeue', has(read.feed, /requeue\s*party/i))) {
      if (time - this.seenAt.champion > 120_000) {
        add(makeEvent('defeat', time, 'vision', { detail: 'The squad is out of the match.' }))
      }
    }
  }

  // "<n> SQUADS LEFT": the count only changes once two looks in a row agree.
  private readSquads(feed: OcrSegment[], time: number, add: (event: GameEvent) => void): void {
    let count: number | null = null
    for (const row of lines(feed)) {
      const text = rowText(row)
      const match = /(\d{1,2})\s*\/?\s*squads?\s*left/i.exec(text)
      if (match) count = Number(match[1])
    }
    if (count === null) return
    // A count changes once two looks in a row agree, or at once when it drops by one right after
    // the squad eliminated someone: the drop the squad caused, when a death box or the next
    // screen may hide the counter.
    const last = this.squadsLeft
    const expected =
      last !== null && count === last - 1 && time - this.lastSquadElimination <= WIPE_MS
    if (count !== this.squadsCandidate && !expected) {
      this.squadsCandidate = count
      return
    }
    this.squadsCandidate = count
    if (last === count) return
    this.squadsLeft = count
    if (last === null) return
    if (count > last) {
      this.endMatch()
      this.squadsLeft = count
      return
    }
    if (last - count <= 3 && time - this.lastSquadElimination <= WIPE_MS) {
      this.lastSquadElimination = -Infinity
      add(
        makeEvent('team_wipe', time, 'memory', {
          detail: `The squad eliminated an enemy, and right after the squads left went from ${last} to ${count}.`,
          confidence: 0.8
        })
      )
    }
    if (count <= FINAL_SQUADS && count >= 2 && !this.finalSquadsSaid) {
      this.finalSquadsSaid = true
      add(
        makeEvent('final_squads', time, 'vision', {
          count,
          detail: `${count} squads left.`,
          confidence: 0.9
        })
      )
    }
  }

  private readRing(ring: OcrSegment[], time: number, add: (event: GameEvent) => void): void {
    const text = ring.map((s) => s.text).join(' ')
    if (!/clos/i.test(text)) return
    const round = /(\d)\s*[-–]?\s*clos/i.exec(text)?.[1] ?? ''
    const last = this.lastRing
    const same = last && (round ? last.round === round : time - last.at < 120_000)
    if (last && same) {
      last.at = time
      return
    }
    this.lastRing = { round, at: time }
    add(
      makeEvent('ring_closing', time, 'vision', {
        count: round ? Number(round) : 1,
        detail: round ? `Ring round ${round} is closing.` : 'The ring is closing.',
        confidence: 0.9
      })
    )
  }

  // More enemies in one fight than one squad has: another squad joined.
  private checkThirdParty(time: number, add: (event: GameEvent) => void): void {
    const fight = this.engagement
    if (!fight || fight.thirdPartySaid) return
    const squad = Math.max(2, this.roster.length + 1)
    if (Math.max(fight.enemies.size, fight.legends.size) <= squad) return
    fight.thirdPartySaid = true
    add(
      makeEvent('third_party', time, 'memory', {
        detail: 'More enemies have taken part in this fight than one squad has.',
        confidence: 0.8
      })
    )
  }

  private endMatch(): void {
    this.squadsLeft = null
    this.squadsCandidate = null
    this.finalSquadsSaid = false
    this.killLeaderSaid = 0
    this.engagement = null
    this.teammatesDown.clear()
    this.lastRing = null
    this.burst = null
    this.bars = null
    this.recentHealth = []
    this.critical = false
    this.shieldBrokenAt = -Infinity
    this.cards = []
  }
}

const COMBAT = new Set<GameEvent['type']>([
  'shield_break',
  'knock',
  'multi_knock',
  'kill',
  'teammate_down',
  'player_knocked',
  'team_wipe',
  'third_party',
  'low_health',
  'player_shield_broken',
  'heavy_damage'
])
