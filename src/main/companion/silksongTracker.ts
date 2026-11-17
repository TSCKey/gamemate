// Turns the stream of Silksong screen measurements into moments worth commenting on.
// Time is passed in (milliseconds), never read from the clock, so tests can drive it.
// Every number below is a first estimate, to be tuned against real footage.
import { isBlackFrame, type SilksongMeasure } from '../../shared/screen/silksong'

/** A mask count is only trusted once it holds for this many frames in a row. */
const MASK_HOLD_FRAMES = 2
/** Having 2 or more masks for this long after a close call means the player recovered. */
const RECOVERY_MS = 3000
/** Below this brightness the frame is a fade or death screen, which reads 0 masks. */
const FADE_BRIGHTNESS = 0.05
/** A fade has to start from a frame at least this bright. */
const BRIGHT_BEFORE_FADE = 0.2
/** ... and get dark within this long. */
const FADE_START_WINDOW_MS = 1000
/** A fade at least this long is a death. */
const DEATH_FADE_MS = 1500
/** A fade at least this long, but shorter than a death, is a room change. */
const ROOM_FADE_MIN_MS = 200
/** Text scores above this count as text on screen. */
const TEXT_ON = 0.3
/** Text must stay on this long before it counts as a title or pickup. */
const TEXT_HOLD_MS = 500
/** Scores below this count as no text at all. */
const TEXT_OFF = 0.1
/** After this long with no text, the next text is a new showing. */
const TEXT_REARM_MS = 2000
/** A room change this long after a boss began, with no death, means it was beaten. */
const BOSS_MIN_MS = 20000
/**
 * Black frames in a row, with no masks, that mean the capture is blocked (10 s at 4 per second).
 * Longer than any death fade, which is black for a few seconds at most; a blocked capture stays
 * black for good.
 */
const BLOCKED_FRAMES = 40
/** Damage this recently means the player is in a fight. */
const FIGHTING_MS = 10000

export type ScreenSignal =
  | { kind: 'damage'; masks: number }
  | { kind: 'close_call' }
  | { kind: 'recovered' }
  | { kind: 'death' }
  | { kind: 'room_change' }
  | { kind: 'title'; title: 'area' | 'boss' }
  | { kind: 'pickup' }
  | { kind: 'boss_defeated' }
  | { kind: 'blocked' }

/** Watches one text region: one signal per showing, then waits for the text to go away. */
class TextWatch {
  private since: number | null = null
  private quietSince: number | null = null
  private fired = false

  /** True once, when the text has been held long enough. */
  update(score: number, time: number): boolean {
    if (score > TEXT_ON) {
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
    if (score < TEXT_OFF) {
      this.quietSince ??= time
      if (time - this.quietSince >= TEXT_REARM_MS) this.fired = false
    } else {
      this.quietSince = null
    }
    return false
  }
}

export class SilksongTracker {
  private candidate: { count: number; frames: number } | null = null
  private masks: number | null = null
  private closeCallArmed = true
  private recoveryPending = false
  private goodSince: number | null = null
  private lastDamage: number | null = null

  private lastBright: number | null = null
  private fadeStart: number | null = null

  private area = new TextWatch()
  private boss = new TextWatch()
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

    this.trackMasks(m, time, out)
    this.trackFade(m, time, out)

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
    this.area = new TextWatch()
    this.boss = new TextWatch()
    this.pickup = new TextWatch()
    this.bossName = null
    this.bossSince = null
    this.blackFrames = 0
    this.blockedSent = false
    this.seen = false
    this.now = 0
  }

  private trackMasks(m: SilksongMeasure, time: number, out: ScreenSignal[]): void {
    // Fades and death screens show no masks; those frames say nothing about health.
    if (m.brightness < FADE_BRIGHTNESS) return

    if (this.candidate && this.candidate.count === m.masks) this.candidate.frames++
    else this.candidate = { count: m.masks, frames: 1 }

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
          this.lastBright !== null && time - this.lastBright <= FADE_START_WINDOW_MS
        if (recentlyBright) this.fadeStart = time
      } else if (m.brightness > BRIGHT_BEFORE_FADE) {
        this.lastBright = time
      }
      return
    }
    if (m.brightness < FADE_BRIGHTNESS) return

    const length = time - this.fadeStart
    this.fadeStart = null
    this.lastBright = m.brightness > BRIGHT_BEFORE_FADE ? time : null
    if (length >= DEATH_FADE_MS) {
      this.death(out)
    } else if (length >= ROOM_FADE_MIN_MS) {
      out.push({ kind: 'room_change' })
      if (
        this.bossName !== null &&
        this.bossSince !== null &&
        time - this.bossSince >= BOSS_MIN_MS
      ) {
        this.bossName = null
        this.bossSince = null
        out.push({ kind: 'boss_defeated' })
      }
    }
  }

  private death(out: ScreenSignal[]): void {
    // Dying ends the fight and any close call; the boss is not beaten.
    this.bossName = null
    this.bossSince = null
    this.recoveryPending = false
    this.goodSince = null
    out.push({ kind: 'death' })
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
