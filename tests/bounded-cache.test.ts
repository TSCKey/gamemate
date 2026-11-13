import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoundedCache } from '../src/shared/boundedCache'

describe('what GameMate remembers from the web', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is forgotten when it gets old, even if nobody asks for it again', () => {
    const cache = new BoundedCache<string>(10, 1000)
    cache.set('creeper', 'page')
    expect(cache.get('creeper')).toBe('page')
    vi.advanceTimersByTime(1001)
    // Storing something else sweeps out what has expired.
    cache.set('zombie', 'page')
    expect(cache.size).toBe(1)
    expect(cache.get('creeper')).toBeUndefined()
  })

  it('keeps only so many things, dropping the one unused the longest', () => {
    const cache = new BoundedCache<number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')
    cache.set('c', 3)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('c')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('remembers that something was not found', () => {
    const cache = new BoundedCache<string | null>(2)
    cache.set('a', null)
    expect(cache.has('a')).toBe(true)
    expect(cache.get('a')).toBeNull()
    cache.delete('a')
    expect(cache.has('a')).toBe(false)
  })
})
