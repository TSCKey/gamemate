import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { idleTimer } from '../src/shared/idle'

describe('freeing what has not been used for a while', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('waits for a quiet stretch after the last use', () => {
    const free = vi.fn()
    const idle = idleTimer(5000, free)
    idle.touch()
    vi.advanceTimersByTime(4000)
    idle.touch()
    vi.advanceTimersByTime(4000)
    expect(free).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(free).toHaveBeenCalledTimes(1)
  })

  it('does nothing before the first use or once cancelled', () => {
    const free = vi.fn()
    const idle = idleTimer(5000, free)
    vi.advanceTimersByTime(10_000)
    idle.touch()
    idle.cancel()
    vi.advanceTimersByTime(10_000)
    expect(free).not.toHaveBeenCalled()
  })

  it('checks again later while still busy', () => {
    let busy = true
    const free = vi.fn()
    const idle = idleTimer(5000, free, () => busy)
    idle.touch()
    vi.advanceTimersByTime(5000)
    expect(free).not.toHaveBeenCalled()
    busy = false
    vi.advanceTimersByTime(5000)
    expect(free).toHaveBeenCalledTimes(1)
  })
})
