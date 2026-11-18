import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, dialog: {} }))

const { PipelineTap, pipelineTap } = await import('../src/main/geis/tap')
const { inspectorAllowed } = await import('../src/main/geis/inspector')
const { Commentator } = await import('../src/main/companion/commentator')
const { makeEvent } = await import('../src/main/companion/events')
type GameEvent = import('../src/main/companion/events').GameEvent

describe('the pipeline tap', () => {
  it('records nothing while it is off, which it is unless the inspector turns it on', () => {
    const tap = new PipelineTap()
    tap.record({ at: 1, stage: 'observation', summary: 'masks 2 to 1' })
    expect(tap.entries()).toEqual([])
    expect(pipelineTap.enabled).toBe(false)
  })

  it('keeps only the last 500 entries, each with a short summary', () => {
    const tap = new PipelineTap()
    tap.enabled = true
    for (let i = 0; i < 600; i++)
      tap.record({ at: i, stage: 'observation', summary: 'x'.repeat(300) })
    expect(tap.entries()).toHaveLength(500)
    expect(tap.entries()[0].at).toBe(100)
    expect(tap.entries()[0].summary).toHaveLength(200)
  })

  it('writes one JSON line per entry', () => {
    const tap = new PipelineTap()
    tap.enabled = true
    tap.record({ at: 1, stage: 'observation', summary: 'a' })
    tap.record({ at: 2, stage: 'observation', summary: 'b' })
    const lines = tap.toJsonl().trim().split('\n')
    expect(lines.map((l) => JSON.parse(l).summary)).toEqual(['a', 'b'])
  })
})

describe('what the tap sees of the pipeline', () => {
  afterEach(() => {
    pipelineTap.enabled = false
    pipelineTap.clear()
  })

  it('follows an event from acceptance to its comment, without the comment’s words', async () => {
    pipelineTap.enabled = true
    let clock = 0
    const commentator = new Commentator({
      now: () => clock,
      generate: async () => 'A secret line nobody should log',
      deliver: () => {}
    })
    const game = { id: 'silksong', name: 'Hollow Knight: Silksong', competitive: false }
    const death: GameEvent = makeEvent('death', 0, 'screen', { detail: 'died in Moss Grotto' })
    const guess: GameEvent = makeEvent('death', 0, 'vision', { detail: 'a guess' })
    commentator.observe(
      {
        time: 0,
        source: 'screen',
        adapterId: 'silksong',
        phase: 'playing',
        inFight: false,
        score: null,
        description: '',
        events: [death, guess]
      },
      game,
      new Set(['death'])
    )
    clock = 4000
    await commentator.speakIfDue({
      frequency: 'normal',
      intensity: 'normal',
      humor: 'light',
      categories: {
        combat: true,
        skill: true,
        teamwork: true,
        objectives: true,
        match: true,
        world: true
      },
      tactics: false,
      language: 'en',
      game
    })
    const stages = pipelineTap.entries().map((e) => [e.stage, e.basis, e.summary])
    expect(stages).toEqual([
      ['filtered', 'model', 'model-only-where-checks-exist'],
      ['accepted', 'verified', 'died in Moss Grotto'],
      ['spoken', 'verified', 'spoken (minor)']
    ])
    expect(pipelineTap.toJsonl()).not.toContain('secret line')
    expect(pipelineTap.entries()[2].latencyMs).toBe(4000)
  })
})

describe('when the inspector may open', () => {
  it('only from source, and only when asked', () => {
    expect(inspectorAllowed(false, { GAMEMATE_INSPECTOR: '1' })).toBe(true)
    expect(inspectorAllowed(false, {})).toBe(false)
    expect(inspectorAllowed(true, { GAMEMATE_INSPECTOR: '1' })).toBe(false)
  })
})
