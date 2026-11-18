// Turns the stream of Silksong screen measurements into moments worth commenting on.
// Time is passed in (milliseconds), never read from the clock, so tests can drive it.
// Every number below is a first estimate, to be tuned against real footage.
import { isBlackFrame, type SilksongMeasure } from '../../shared/screen/silksong'
import { INFER_BOSS_DEFEAT } from './silksongSwitches'

/** A mask count is only trusted once it holds for this many frames in a row. */
const MASK_HOLD_FRAMES = 2
/** Having 2 or more masks for this long after a close call means the player recovered. */
const RECOVERY_MS = 3000
/** Below this brightness the frame is a fade or death screen, which reads 0 masks. */
const FADE_BRIGHTNESS = 0.03
/** A fade has to start from a frame at least this bright (the owner's Silksong scenes measured 0.11-0.16). */
const BRIGHT_BEFORE_FADE = 0.035
/**
 * ... and be at least this many times brighter than the dark frame, so a dim dip in a dark room
 * (the owner's screenshot of one measured 0.04) isn't taken for a fade.
 */
const FADE_DROP_RATIO = 3
/** ... and get dark within this long. */
const FADE_START_WINDOW_MS = 1000
/** A fade at least this long can be a death. */
const DEATH_FADE_MS = 1500
/**
 * A black stretch longer than this is no death or room change: it is a load screen or a lost
 * capture. A first guess; Silksong's real death fade gets measured later.
 */
const DEATH_FADE_MAX_MS = 6000
/**
 * A death needs more than a dark screen: before the fade the player was down to this many masks
 * or fewer (one hit, or one double hit, from dying) ...
 */
const DEATH_MAX_MASKS = 2
/**
 * ... and after it, the first trusted mask count is higher (the refill on respawning) and is read
 * within this long.
 */
const DEATH_REFILL_MS = 10000
/** A fade at least this long, but shorter than a death, is a room change. */
const ROOM_FADE_MIN_MS = 200
/**
 * Silksong's own death, measured on the owner's Last Judge clip: at 1-2 masks the HUD goes with
 * the last hit, a bright grey-brown burst fills the screen (about 0.24) for about 2 s, then black.
 * The burst must last this many frames, and the black come within this long of the HUD going.
 */
const DEATH_BURST_BRIGHTNESS = 0.18
const DEATH_BURST_FRAMES = 3
const DEATH_BURST_WINDOW_MS = 6000
/** After a death seen this way, the fade that follows it is not counted again. */
const AFTER_DEATH_MS = 60000
/** Text scores above this count as text on screen (Silksong's area card measured 0.08-0.12; ordinary play peaked at 0.05). */
const TEXT_ON = 0.06
/** Text must stay on this long before it counts as a title or pickup. */
const TEXT_HOLD_MS = 500
/** Scores below this count as no text at all. */
const TEXT_OFF = 0.02
/**
 * Boss titles are faint in their spot: the owner's Last Judge clip scored 0.021-0.025 there for
 * about 5 s, while ordinary play stayed under 0.015. Anything else read there must still match a
 * boss name before it counts.
 */
const BOSS_TEXT_ON = 0.018
const BOSS_TEXT_OFF = 0.012
/** After this long with no text, the next text is a new showing. */
const TEXT_REARM_MS = 2000
/**
 * A room change this long after a boss began, with no death, is taken to mean it was beaten
 * (only with inferBossDefeat on). A shorter stay ends the fight without a winner.
 */
const BOSS_MIN_MS = 20000
/**
 * Black frames in a row, with no masks, that mean the capture is blocked (10 s at 4 per second).
 * Longer than any death fade or black cutscene (the owner's recording had a 12 s act card); a
 * blocked capture stays black for good.
 */
const BLOCKED_FRAMES = 120
/** Damage this recently means the player is in a fight. */
const FIGHTING_MS = 10000

export type ScreenSignal =
  | { kind: 'damage'; masks: number }
  | { kind: 'close_call' }
  | { kind: 'recovered' }
  | { kind: 'death'; at: number }
  | { kind: 'room_change' }
  | { kind: 'title'; title: 'area' | 'boss' }
  | { kind: 'pickup' }
  | { kind: 'boss_defeated' }
  | { kind: 'blocked' }

/** Watches one text region: one signal per showing, then waits for the text to go away. */
class TextWatch {
  constructor(
    private readonly on = TEXT_ON,
    private readonly off = TEXT_OFF
  ) {}

  private since: number | null = null
  private quietSince: number | null = null
  private fired = false

  /** True once, when the text has been held long enough. */
  update(score: number, time: number): boolean {
    if (score > this.on) {
      this.quietSince = null
      this.since ??= time
      if (!this.fired && time - this.since >= TEXT_HOLD_MS) {
        this.fired = true
        return true
      }
      return false
    }
    // Text that dips out breaks the hold, but only a long quiet allows a new showing.
    this.since = null
    if (score < this.off) {
      this.quietSince ??= time
      if (time - this.quietSince >= TEXT_REARM_MS) this.fired = false
    } else {
      this.quietSince = null
    }
    return false
  }
}

export interface TrackerOptions {
  /** Report a boss as beaten when the player leaves its arena alive (INFER_BOSS_DEFEAT if unset). */
  inferBossDefeat?: boolean
}

export class SilksongTracker {
  constructor(private readonly options: TrackerOptions = {}) {}

  private candidate: { count: number; frames: number } | null = null
  private masks: number | null = null
  private closeCallArmed = true
  private recoveryPending = false
  private goodSince: number | null = null
  private lastDamage: number | null = null

  private lastBright: { time: number; level: number } | null = null
  private fadeStart: number | null = null
  // A fade that could have been a death, waiting for the masks to refill. `masks` is the last
  // count trusted before it; `at` is when it ended.
  private deathPending: { at: number; masks: number } | null = null
  private hudGoneSince: number | null = null
  private burstFrames = 0
  private lastDeath: number | null = null

  private area = new TextWatch()
  private boss = new TextWatch(BOSS_TEXT_ON, BOSS_TEXT_OFF)
  private pickup = new TextWatch()

  private bossName: string | null = null
  private bossSince: number | null = null

  private blackFrames = 0
  private blockedSent = false

  private now = 0
  private seen = false

  push(m: SilksongMeasure, time: number): ScreenSignal[] {
    this.now = time
    this.seen = true
    if (this.bossName !== null) this.bossSince ??= time
    const out: ScreenSignal[] = []

    if (this.deathPending && time - this.deathPending.at > DEATH_REFILL_MS) this.deathPending = null
    this.trackDeathBurst(m, time, out)
    // The fade first, so a frame that ends a death fade is never also read as a recovery.
    this.trackFade(m, time, out)
    this.trackMasks(m, time, out)

    if (this.area.update(m.areaText, time)) out.push({ kind: 'title', title: 'area' })
    if (this.boss.update(m.bossText, time)) out.push({ kind: 'title', title: 'boss' })
    if (this.pickup.update(m.pickupText, time)) out.push({ kind: 'pickup' })

    this.trackBlocked(m, out)
    return out
  }

  /** Tells the tracker a boss fight began, so a later room change can mean it was beaten. */
  setBoss(name: string | null): void {
    this.bossName = name
    this.bossSince = name !== null && this.seen ? this.now : null
  }

  fighting(): boolean {
    return this.lastDamage !== null && this.now - this.lastDamage <= FIGHTING_MS
  }

  reset(): void {
    this.candidate = null
    this.masks = null
    this.closeCallArmed = true
    this.recoveryPending = false
    this.goodSince = null
    this.lastDamage = null
    this.lastBright = null
    this.fadeStart = null
    this.deathPending = null
    this.hudGoneSince = null
    this.burstFrames = 0
    this.lastDeath = null
    this.area = new TextWatch()
    this.boss = new TextWatch(BOSS_TEXT_ON, BOSS_TEXT_OFF)
    this.pickup = new TextWatch()
    this.bossName = null
    this.bossSince = null
    this.blackFrames = 0
    this.blockedSent = false
    this.seen = false
    this.now = 0
  }

  private trackMasks(m: SilksongMeasure, time: number, out: ScreenSignal[]): void {
    // Fades and death screens show no masks, and neither does a map, inventory or cutscene with
    // the HUD hidden. A living player always has at least 1 mask, so 0 is unreadable, not health.
    if (m.brightness < FADE_BRIGHTNESS || m.masks === 0) return

    if (this.candidate && this.candidate.count === m.masks) this.candidate.frames++
    else this.candidate = { count: m.masks, frames: 1 }

    // A possible death is settled by the first count trusted after the fade: a respawn comes
    // back with more masks. The same count or fewer is the player still alive, and a later heal
    // or bench rest is no death.
    const pending = this.deathPending
    if (pending && this.candidate.frames >= MASK_HOLD_FRAMES) {
      this.deathPending = null
      if (this.candidate.count > pending.masks) this.death(pending.at, out)
    }

    if (this.candidate.frames >= MASK_HOLD_FRAMES && this.masks !== this.candidate.count) {
      const previous = this.masks
      this.masks = this.candidate.count
      if (previous !== null && this.masks < previous) {
        this.lastDamage = time
        out.push({ kind: 'damage', masks: this.masks })
      }
    }

    const held = this.masks
    if (held === null) return
    // Until a possible death is settled, the masks say nothing about close calls or recovery.
    if (this.deathPending) {
      this.goodSince = null
      return
    }
    if (held === 1) {
      this.goodSince = null
      if (this.closeCallArmed) {
        this.closeCallArmed = false
        this.recoveryPending = true
        out.push({ kind: 'close_call' })
      }
    } else if (held >= 2) {
      this.closeCallArmed = true
      if (this.recoveryPending) {
        this.goodSince ??= time
        if (time - this.goodSince >= RECOVERY_MS) {
          this.recoveryPending = false
          this.goodSince = null
          out.push({ kind: 'recovered' })
        }
      }
    } else {
      this.goodSince = null
    }
  }

  private trackFade(m: SilksongMeasure, time: number, out: ScreenSignal[]): void {
    if (this.fadeStart === null) {
      if (m.brightness < FADE_BRIGHTNESS) {
        const recentlyBright =
          this.lastBright !== null &&
          time - this.lastBright.time <= FADE_START_WINDOW_MS &&
          m.brightness * FADE_DROP_RATIO <= this.lastBright.level
        if (recentlyBright) this.fadeStart = time
      } else if (m.brightness > BRIGHT_BEFORE_FADE) {
        this.lastBright = { time, level: m.brightness }
      }
      return
    }
    if (m.brightness < FADE_BRIGHTNESS) return

    const length = time - this.fadeStart
    this.fadeStart = null
    this.lastBright = m.brightness > BRIGHT_BEFORE_FADE ? { time, level: m.brightness } : null
    if (length > DEATH_FADE_MAX_MS || this.blockedSent) {
      // Too long to be a death or a room change, or the capture was reported blocked meanwhile.
      return
    }
    if (length >= DEATH_FADE_MS) {
      // Only a possible death: it counts once the masks refill, and is dated to now.
      const justDied = this.lastDeath !== null && time - this.lastDeath <= AFTER_DEATH_MS
      if (!justDied && this.masks !== null && this.masks <= DEATH_MAX_MASKS) {
        this.deathPending = { at: time, masks: this.masks }
        // Frames from before the fade must not count toward the first count after it.
        this.candidate = null
      }
    } else if (length >= ROOM_FADE_MIN_MS) {
      out.push({ kind: 'room_change' })
      this.leaveRoom(time, out)
    }
  }

  // Leaving the room ends any boss fight, won or not: a later room change must never be read as
  // beating this boss.
  private leaveRoom(time: number, out: ScreenSignal[]): void {
    if (this.bossName === null) return
    const long = this.bossSince !== null && time - this.bossSince >= BOSS_MIN_MS
    this.bossName = null
    this.bossSince = null
    // A fade that may have been a death just before is no sign of a win.
    if (long && !this.deathPending && (this.options.inferBossDefeat ?? INFER_BOSS_DEFEAT)) {
      out.push({ kind: 'boss_defeated' })
    }
  }

  private trackDeathBurst(m: SilksongMeasure, time: number, out: ScreenSignal[]): void {
    if (m.masks > 0) {
      this.hudGoneSince = null
      this.burstFrames = 0
      return
    }
    if (this.hudGoneSince === null) {
      // The HUD went while the player was down to their last masks, and not into a fade.
      if (this.masks !== null && this.masks <= DEATH_MAX_MASKS && m.brightness >= FADE_BRIGHTNESS) {
        this.hudGoneSince = time
        this.burstFrames = 0
      }
      return
    }
    if (time - this.hudGoneSince > DEATH_BURST_WINDOW_MS) {
      this.hudGoneSince = null
      this.burstFrames = 0
      return
    }
    if (m.brightness >= DEATH_BURST_BRIGHTNESS) this.burstFrames++
    else if (m.brightness < FADE_BRIGHTNESS && this.burstFrames >= DEATH_BURST_FRAMES) {
      this.hudGoneSince = null
      this.burstFrames = 0
      // The masks are read afresh after the respawn, so the refill is no change to report.
      this.masks = null
      this.candidate = null
      this.closeCallArmed = true
      this.death(time, out)
    }
  }

  private death(at: number, out: ScreenSignal[]): void {
    // Dying ends the fight and any close call; the boss is not beaten.
    this.lastDeath = at
    this.bossName = null
    this.bossSince = null
    this.recoveryPending = false
    this.goodSince = null
    out.push({ kind: 'death', at })
  }

  private trackBlocked(m: SilksongMeasure, out: ScreenSignal[]): void {
    if (!isBlackFrame(m)) {
      this.blackFrames = 0
      this.blockedSent = false
      return
    }
    this.blackFrames = m.masks === 0 ? this.blackFrames + 1 : 0
    if (this.blackFrames >= BLOCKED_FRAMES && !this.blockedSent) {
      this.blockedSent = true
      out.push({ kind: 'blocked' })
    }
  }
}
