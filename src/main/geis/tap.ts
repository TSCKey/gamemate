// A record of what went through the pipeline, for the developer inspector and trace files. It is
// off unless the inspector turns it on (development only), and then costs one small object per
// stage. It holds numbers, names and reasons, never a frame or a comment's words, and only the
// last few minutes.
import type { CommentaryStatus, EvidenceBasis, GameEvent } from '../companion/events'

export type TapStage =
  // An adapter's own reading, before it became an event (a measure, an OCR read, a look).
  | 'observation'
  | 'accepted'
  | 'filtered'
  | 'duplicate'
  // Worked out by memory or a sequence rule.
  | 'derived'
  // The Director settled an event without a comment (stale, filtered, superseded, unsaid).
  | 'settled'
  | 'spoken'

export interface TapEntry {
  // When the stage happened (the clock of the pipeline).
  at: number
  stage: TapStage
  adapterId?: string
  eventId?: string
  type?: string
  basis?: EvidenceBasis
  confidence?: number
  commentary?: CommentaryStatus
  related?: string[]
  // Short: what was seen or why something happened (at most 200 characters).
  summary: string
  // Milliseconds from the moment on screen to this stage.
  latencyMs?: number
}

const MAX_ENTRIES = 500
const MAX_SUMMARY = 200

export class PipelineTap {
  private ring: TapEntry[] = []
  private listeners = new Set<(entry: TapEntry) => void>()
  enabled = false

  record(entry: TapEntry): void {
    if (!this.enabled) return
    const kept = { ...entry, summary: entry.summary.slice(0, MAX_SUMMARY) }
    this.ring.push(kept)
    if (this.ring.length > MAX_ENTRIES) this.ring.shift()
    for (const listener of this.listeners) listener(kept)
  }

  // One entry for an event at a stage.
  event(stage: TapStage, event: GameEvent, at: number, summary = event.detail): void {
    if (!this.enabled) return
    this.record({
      at,
      stage,
      adapterId: event.adapterId,
      eventId: event.id,
      type: event.type,
      basis: event.basis,
      confidence: event.confidence,
      commentary: event.commentary,
      ...(event.related.length ? { related: event.related } : {}),
      summary,
      latencyMs: Math.max(0, at - event.time)
    })
  }

  entries(): readonly TapEntry[] {
    return this.ring
  }

  onEntry(listener: (entry: TapEntry) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // The ring as JSON lines, the format the replay tests read too.
  toJsonl(): string {
    return this.ring.map((e) => JSON.stringify(e)).join('\n') + (this.ring.length ? '\n' : '')
  }

  clear(): void {
    this.ring = []
  }
}

export const pipelineTap = new PipelineTap()
