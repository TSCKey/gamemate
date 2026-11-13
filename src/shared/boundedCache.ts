// A small memory for things fetched from the web or read from disk: it holds a limited number of
// entries, and forgets each after a while. A plain Map with an expiry checked on reading keeps
// every entry that is never asked for again, for as long as GameMate runs.
export class BoundedCache<V> {
  private readonly entries = new Map<string, { at: number; value: V }>()

  constructor(
    private readonly max: number,
    private readonly ttlMs = Infinity
  ) {}

  private fresh(entry: { at: number }): boolean {
    return Date.now() - entry.at < this.ttlMs
  }

  has(key: string): boolean {
    const entry = this.entries.get(key)
    if (entry && !this.fresh(entry)) this.entries.delete(key)
    return this.entries.has(key)
  }

  get(key: string): V | undefined {
    if (!this.has(key)) return undefined
    const entry = this.entries.get(key)!
    // Most recently used goes last, so the first entry is the one unused the longest.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: V): void {
    for (const [k, entry] of this.entries) if (!this.fresh(entry)) this.entries.delete(k)
    this.entries.delete(key)
    this.entries.set(key, { at: Date.now(), value })
    while (this.entries.size > this.max) {
      this.entries.delete(this.entries.keys().next().value as string)
    }
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  get size(): number {
    return this.entries.size
  }
}
