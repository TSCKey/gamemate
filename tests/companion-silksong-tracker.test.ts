import { describe, expect, it } from 'vitest'
import { SilksongTracker, type ScreenSignal } from '../src/main/companion/silksongTracker'
import type { SilksongMeasure } from '../src/shared/screen/silksong'

const STEP = 250 // the renderer measures four times a second

const base: SilksongMeasure = {
  brightness: 0.5,
  masks: 5,
  areaText: 0,
  bossText: 0,
  pickupText: 0
}

/** Feeds `count` frames of one scene, 250 ms apart, and returns every signal with its time. */
class Run {
  time = 0
  signals: { time: number; signal: ScreenSignal }[] = []
  constructor(public tracker = new SilksongTracker()) {}

  frames(count: number, over: Partial<SilksongMeasure> = {}, step = STEP): this {
    for (let i = 0; i < count; i++) {
      const out = this.tracker.push({ ...base, ...over }, this.time)
      for (const signal of out) this.signals.push({ time: this.time, signal })
      this.time += step
    }
    return this
  }

  /** Same, for a number of seconds. */
  seconds(s: number, over: Partial<SilksongMeasure> = {}): this {
    return this.frames(Math.round((s * 1000) / STEP), over)
  }

  kinds(): string[] {
    return this.signals.map((s) => s.signal.kind)
  }
}

describe('SilksongTracker masks', () => {
  it('reports damage when a held mask count drops', () => {
    const run = new Run().frames(4, { masks: 5 }).frames(3, { masks: 4 })
    expect(run.signals.map((s) => s.signal)).toEqual([{ kind: 'damage', masks: 4 }])
  })

  it('does not trust a mask count that lasts a single frame', () => {
    const run = new Run().frames(3, { masks: 3 }).frames(1, { masks: 2 }).frames(3, { masks: 3 })
    expect(run.kinds()).toEqual([])
  })

  it('reports damage only after the lower count holds for 2 frames', () => {
    const run = new Run().frames(3, { masks: 5 }).frames(1, { masks: 4 })
    expect(run.kinds()).toEqual([])
    run.frames(1, { masks: 4 })
    expect(run.kinds()).toEqual(['damage'])
  })

  it('does not report damage when masks go up', () => {
    const run = new Run().frames(3, { masks: 3 }).frames(3, { masks: 4 })
    expect(run.kinds()).toEqual([])
  })

  it('reports a close call once when masks reach 1', () => {
    const run = new Run().frames(3, { masks: 3 }).frames(3, { masks: 1 }).frames(6, { masks: 1 })
    expect(run.kinds()).toEqual(['damage', 'close_call'])
  })

  it('allows another close call after masks went back up to 2 or more', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(3, { masks: 2 })
      .frames(3, { masks: 1 })
    expect(run.kinds().filter((k) => k === 'close_call')).toHaveLength(2)
  })

  it('reports recovered when 2 or more masks hold for 3 s after a close call', () => {
    const run = new Run().frames(3, { masks: 3 }).frames(3, { masks: 1 }).frames(2, { masks: 3 })
    const before = run.kinds()
    expect(before).not.toContain('recovered')
    run.seconds(3, { masks: 3 })
    expect(run.kinds().filter((k) => k === 'recovered')).toHaveLength(1)
  })

  it('does not report recovered when masks fall back to 1 before 3 s', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .seconds(2, { masks: 3 })
      .frames(3, { masks: 1 })
      .seconds(2, { masks: 3 })
    expect(run.kinds()).not.toContain('recovered')
  })

  it('does not report recovered without a close call first', () => {
    const run = new Run().seconds(10, { masks: 4 })
    expect(run.kinds()).toEqual([])
  })

  it('ignores the mask count on dark frames, so fades are not close calls', () => {
    const run = new Run()
      .frames(4, { masks: 5 })
      .frames(3, { brightness: 0.03, masks: 0 })
      .frames(4, { masks: 5 })
    expect(run.kinds()).not.toContain('damage')
    expect(run.kinds()).not.toContain('close_call')
  })

  it('lets dark frames neither confirm nor break a held mask count', () => {
    // One real frame of 4, a dark frame, then one more real frame of 4: that is 2 frames.
    const run = new Run()
      .frames(4, { masks: 5 })
      .frames(1, { masks: 4 })
      .frames(1, { brightness: 0.03, masks: 0 })
      .frames(1, { masks: 4 })
    expect(run.kinds()).toContain('damage')
  })
})

describe('SilksongTracker hidden HUD', () => {
  it('does not read a bright screen with no masks as damage', () => {
    const run = new Run().frames(4, { masks: 5 }).seconds(3, { masks: 0 }).frames(4, { masks: 5 })
    expect(run.kinds()).toEqual([])
    expect(run.tracker.fighting()).toBe(false)
  })

  it('still reports a close call and recovery with 1 mask as a real reading', () => {
    const run = new Run().frames(3, { masks: 3 }).frames(3, { masks: 1 }).seconds(4, { masks: 3 })
    expect(run.kinds()).toEqual(['damage', 'close_call', 'recovered'])
  })
})

describe('SilksongTracker fades', () => {
  it('gives neither death nor room change for an 8 s black stretch', () => {
    const run = new Run().frames(4).seconds(8, { brightness: 0.02, masks: 0 }).frames(2)
    expect(run.kinds()).toEqual([])
  })

  it('gives no death when the capture was reported blocked and then came back', () => {
    const run = new Run().frames(4).frames(124, { brightness: 0, masks: 0 }).frames(2)
    expect(run.kinds()).toEqual(['blocked'])
  })

  it('reports a death for a fade of at least 1.5 s from 1 mask, once the masks refill', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(6, { brightness: 0.02, masks: 0 }) // dark 1.5 s
    const fadeEnd = run.time
    run.frames(1, { masks: 5 })
    expect(run.kinds()).not.toContain('death')
    // The refilled count is trusted on its second frame: that confirms the death.
    run.frames(1, { masks: 5 })
    expect(run.kinds()).toEqual(['damage', 'close_call', 'death'])
    // It is dated to the end of the fade, when it happened.
    expect(run.signals.at(-1)?.signal).toEqual({ kind: 'death', at: fadeEnd })
  })

  it('reports a death from 2 masks too', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 2 })
      .frames(8, { brightness: 0.02, masks: 0 })
      .frames(3, { masks: 5 })
    expect(run.kinds()).toContain('death')
  })

  it('gives nothing for a death-length fade with 5 masks before it', () => {
    const run = new Run()
      .frames(4, { masks: 5 })
      .frames(6, { brightness: 0.02, masks: 0 })
      .seconds(5, { masks: 5 })
    expect(run.kinds()).toEqual([])
  })

  it('gives nothing when the masks are still 1 after the fade', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(6, { brightness: 0.02, masks: 0 })
      .seconds(11, { masks: 1 })
    expect(run.kinds()).not.toContain('death')
  })

  it('gives no death for a heal after a dark stretch the masks came back from unchanged', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(8, { brightness: 0.02, masks: 0 }) // dark 2 s
      .frames(2, { masks: 1 }) // the HUD comes back with the same mask: no respawn
      .frames(3, { masks: 4 }) // then a heal
    expect(run.kinds()).not.toContain('death')
  })

  it('judges by the first trusted count after the fade, not a single untrusted frame', () => {
    // One frame of 1 is not trusted, so the first trusted count is the 4: a refill.
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(8, { brightness: 0.02, masks: 0 })
      .frames(1, { masks: 1 })
      .frames(2, { masks: 4 })
    expect(run.kinds()).toContain('death')
  })

  it('gives nothing when the masks refill more than 10 s after the fade', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(6, { brightness: 0.02, masks: 0 })
      .seconds(10.5, { masks: 1 })
      .frames(3, { masks: 5 })
    expect(run.kinds()).not.toContain('death')
  })

  it('reports no recovery for the masks refilled after a death', () => {
    const run = new Run()
      .frames(3, { masks: 3 })
      .frames(3, { masks: 1 })
      .frames(2, { masks: 2 })
      .frames(12, { brightness: 0.02, masks: 0 }) // dark 3 s
      .seconds(5, { masks: 5 })
    expect(run.kinds()).toContain('death')
    expect(run.kinds()).not.toContain('recovered')
  })

  it('reports a room change for a fade between 0.2 s and 1.5 s', () => {
    const run = new Run()
      .frames(4)
      .frames(2, { brightness: 0.02, masks: 0 }) // dark 0.5 s
      .frames(2)
    expect(run.kinds()).toEqual(['room_change'])
  })

  // The owner's Silksong scenes measured 0.11-0.16 mean brightness.
  it('notices a room change in a scene as dim as Silksong usually is', () => {
    const run = new Run()
      .frames(4, { brightness: 0.12 })
      .frames(2, { brightness: 0.01, masks: 0 })
      .frames(2, { brightness: 0.12 })
    expect(run.kinds()).toEqual(['room_change'])
  })

  // The owner's screenshot of a dark room measured 0.04.
  it('notices a room change in a room as dark as 0.04', () => {
    const run = new Run()
      .frames(4, { brightness: 0.04 })
      .frames(2, { brightness: 0.002, masks: 0 })
      .frames(2, { brightness: 0.04 })
    expect(run.kinds()).toEqual(['room_change'])
  })

  it('does not take a dim dip in a dark room for a fade', () => {
    const run = new Run()
      .frames(4, { brightness: 0.04 })
      .frames(2, { brightness: 0.025 })
      .frames(2, { brightness: 0.04 })
    expect(run.kinds()).toEqual([])
  })

  it('ignores a dip that is gone within 0.2 s', () => {
    const run = new Run()
    run.tracker.push({ ...base }, 0)
    expect(run.tracker.push({ ...base, brightness: 0.02 }, 100)).toEqual([])
    expect(run.tracker.push({ ...base }, 200)).toEqual([])
  })

  it('does not count a fade that did not start from a bright frame', () => {
    const run = new Run()
      .frames(4, { brightness: 0.05 })
      .frames(4, { brightness: 0.02, masks: 0 })
      .frames(2, { brightness: 0.05 })
    expect(run.kinds()).toEqual([])
  })

  it('does not count a slow fade where brightness takes more than 1 s to fall', () => {
    const run = new Run()
      .frames(4)
      .frames(6, { brightness: 0.05 }) // 1.5 s at a middling level
      .frames(4, { brightness: 0.02, masks: 0 })
      .frames(2)
    expect(run.kinds()).toEqual([])
  })
})

describe('SilksongTracker titles', () => {
  it('reports an area title held for 0.5 s', () => {
    const run = new Run().frames(1).frames(4, { areaText: 0.6 })
    expect(run.signals.map((s) => s.signal)).toEqual([{ kind: 'title', title: 'area' }])
  })

  // Measured on the owner's recording: Silksong's area card scored 0.08-0.12 in its spot for
  // about 5 s, while ordinary play peaked at 0.04-0.05 for a frame or two.
  it('reports an area card as dim in its spot as Silksong’s (0.08)', () => {
    const run = new Run().frames(1).frames(4, { areaText: 0.08 })
    expect(run.signals.map((s) => s.signal)).toEqual([{ kind: 'title', title: 'area' }])
  })

  it('ignores the brief flickers of ordinary play in the title spot (up to 0.05)', () => {
    const run = new Run().seconds(3, { areaText: 0.05 })
    expect(run.kinds()).toEqual([])
  })

  // Measured on the owner's Last Judge clip: the boss title scored 0.021-0.025 for about 5 s in
  // its spot, where ordinary play stayed under 0.015.
  it('reports a boss title as faint as Silksong’s (0.022)', () => {
    const run = new Run().frames(1).frames(4, { bossText: 0.022 })
    expect(run.signals.map((s) => s.signal)).toEqual([{ kind: 'title', title: 'boss' }])
  })

  it('ignores the faint flickers of ordinary play in the boss spot (under 0.015)', () => {
    const run = new Run().seconds(3, { bossText: 0.014 })
    expect(run.kinds()).toEqual([])
  })

  it('reports a boss title as a boss title', () => {
    const run = new Run().frames(5, { bossText: 0.6 })
    expect(run.signals.map((s) => s.signal)).toEqual([{ kind: 'title', title: 'boss' }])
  })

  it('does not report text that is gone before 0.5 s', () => {
    const run = new Run().frames(2, { areaText: 0.6 }).frames(4)
    expect(run.kinds()).toEqual([])
  })

  it('does not report a score at or under 0.06', () => {
    const run = new Run().seconds(3, { areaText: 0.06 })
    expect(run.kinds()).toEqual([])
  })

  it('gives one signal for a title held for 10 s', () => {
    const run = new Run().seconds(10, { areaText: 0.8 })
    expect(run.kinds()).toEqual(['title'])
  })

  it('allows a new showing after the score was below 0.02 for 2 s', () => {
    const run = new Run()
      .seconds(2, { areaText: 0.8 })
      .seconds(2.25, {})
      .seconds(2, { areaText: 0.8 })
    expect(run.kinds()).toEqual(['title', 'title'])
  })

  it('does not allow a new showing after a pause shorter than 2 s', () => {
    const run = new Run().seconds(2, { areaText: 0.8 }).seconds(1, {}).seconds(2, { areaText: 0.8 })
    expect(run.kinds()).toEqual(['title'])
  })

  it('does not re-arm while the score hovers between 0.02 and 0.06', () => {
    const run = new Run()
      .seconds(2, { areaText: 0.8 })
      .seconds(5, { areaText: 0.04 })
      .seconds(2, { areaText: 0.8 })
    expect(run.kinds()).toEqual(['title'])
  })

  it('keeps area and boss titles apart', () => {
    const run = new Run().seconds(2, { areaText: 0.8, bossText: 0.8 })
    expect(run.signals.map((s) => s.signal)).toEqual([
      { kind: 'title', title: 'area' },
      { kind: 'title', title: 'boss' }
    ])
  })

  it('forgets a half-held title on reset', () => {
    const t = new SilksongTracker()
    const out: ScreenSignal[] = []
    for (const time of [0, 100, 200, 300]) out.push(...t.push({ ...base, areaText: 0.8 }, time))
    t.reset()
    for (const time of [400, 500, 600, 700]) out.push(...t.push({ ...base, areaText: 0.8 }, time))
    expect(out).toEqual([])
  })
})

describe('SilksongTracker pickups', () => {
  it('reports a pickup once per showing', () => {
    const run = new Run().seconds(8, { pickupText: 0.7 })
    expect(run.kinds()).toEqual(['pickup'])
  })

  it('allows another pickup after the text was gone for 2 s', () => {
    const run = new Run()
      .seconds(2, { pickupText: 0.7 })
      .seconds(2.25, {})
      .seconds(2, { pickupText: 0.7 })
    expect(run.kinds()).toEqual(['pickup', 'pickup'])
  })
})

describe('SilksongTracker boss defeated', () => {
  const roomChange = (run: Run): Run => run.frames(2, { brightness: 0.02, masks: 0 }).frames(2)
  // Inferring a win is switched off in the app; these tests turn it on to check the rule itself.
  const inferring = (): Run => new Run(new SilksongTracker({ inferBossDefeat: true }))

  it('gives no boss_defeated with the shipped settings, however long the fight', () => {
    const run = new Run().frames(2)
    run.tracker.setBoss('Moorwing')
    run.seconds(21)
    roomChange(run)
    expect(run.kinds()).toEqual(['room_change'])
  })

  it('treats a room change under 20 s into a fight as the end of it, so a later one is no win', () => {
    const run = inferring().frames(2)
    run.tracker.setBoss('Moorwing')
    run.seconds(5)
    roomChange(run)
    run.seconds(30)
    roomChange(run)
    expect(run.kinds()).toEqual(['room_change', 'room_change'])
  })

  it('reports boss_defeated for a room change 20 s or more after the boss began', () => {
    const run = inferring().frames(2)
    run.tracker.setBoss('Moorwing')
    run.seconds(21)
    roomChange(run)
    expect(run.kinds()).toEqual(['room_change', 'boss_defeated'])
  })

  it('does not report boss_defeated for a room change within 20 s', () => {
    const run = inferring().frames(2)
    run.tracker.setBoss('Moorwing')
    run.seconds(5)
    roomChange(run)
    expect(run.kinds()).toEqual(['room_change'])
  })

  it('reports it only once, then forgets the boss', () => {
    const run = inferring().frames(2)
    run.tracker.setBoss('Moorwing')
    run.seconds(21)
    roomChange(run)
    run.seconds(2)
    roomChange(run)
    expect(run.kinds().filter((k) => k === 'boss_defeated')).toHaveLength(1)
  })

  it('does not report boss_defeated when the player died during the boss', () => {
    const run = inferring().frames(2)
    run.tracker.setBoss('Moorwing')
    run.seconds(21)
    run.frames(2, { masks: 1 })
    run.frames(6, { brightness: 0.02, masks: 0 }).frames(2) // death
    roomChange(run)
    expect(run.kinds()).toEqual(['damage', 'close_call', 'death', 'room_change'])
  })

  it('does nothing without a boss', () => {
    const run = inferring().frames(2).seconds(30)
    roomChange(run)
    expect(run.kinds()).toEqual(['room_change'])
  })
})

describe('SilksongTracker blocked capture', () => {
  const black = { brightness: 0, masks: 0 }

  it('reports blocked after 120 black frames in a row, once', () => {
    const run = new Run().frames(3).frames(119, black)
    expect(run.kinds()).not.toContain('blocked')
    run.frames(1, black).frames(10, black)
    expect(run.kinds().filter((k) => k === 'blocked')).toHaveLength(1)
  })

  it('does not report blocked when a bright frame interrupts the black ones', () => {
    const run = new Run().frames(119, black).frames(1).frames(119, black)
    expect(run.kinds()).not.toContain('blocked')
  })

  it('can report blocked again after a non-black frame arrives', () => {
    const run = new Run().frames(120, black).frames(2).frames(120, black)
    expect(run.kinds().filter((k) => k === 'blocked')).toHaveLength(2)
  })

  // The owner's recording had a black act card and cutscene lasting about 12 s.
  it('does not report blocked for a 20 s black cutscene', () => {
    const run = new Run().frames(4).seconds(20, black).frames(2)
    expect(run.kinds()).not.toContain('blocked')
  })

  it('does not report blocked for a 3 s death fade, only the death', () => {
    const run = new Run().frames(4, { masks: 1 }).frames(12, black).frames(2)
    expect(run.kinds()).toEqual(['close_call', 'death'])
  })
})

describe('SilksongTracker fighting', () => {
  it('is true for 10 s after damage and false after', () => {
    const run = new Run().frames(3, { masks: 5 }).frames(2, { masks: 4 })
    expect(run.tracker.fighting()).toBe(true)
    run.seconds(9, { masks: 4 })
    expect(run.tracker.fighting()).toBe(true)
    run.seconds(2, { masks: 4 })
    expect(run.tracker.fighting()).toBe(false)
  })

  it('is false before any damage', () => {
    const run = new Run().seconds(5)
    expect(run.tracker.fighting()).toBe(false)
  })
})

describe('SilksongTracker reset', () => {
  it('clears fighting, the boss and the held mask count', () => {
    const run = new Run(new SilksongTracker({ inferBossDefeat: true }))
      .frames(3, { masks: 5 })
      .frames(2, { masks: 4 })
    run.tracker.setBoss('Moorwing')
    run.tracker.reset()
    expect(run.tracker.fighting()).toBe(false)
    // After a reset the first held count is a fresh start, not a drop from 4 to 3.
    const after = new Run(run.tracker)
    after.time = 100000
    after.frames(3, { masks: 3 })
    expect(after.kinds()).toEqual([])
    after.seconds(21)
    after.frames(2, { brightness: 0.02, masks: 0 }).frames(2)
    expect(after.kinds()).toEqual(['room_change'])
  })
})
