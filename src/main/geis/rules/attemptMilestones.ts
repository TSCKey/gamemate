// Single-player: the fifth, tenth and twentieth try at the same boss are moments of their own.
// Only verified boss titles count, so a model's guess never adds a try.
import type { CorrelationRule } from '../correlation'

const MILESTONES = [5, 10, 20]
// As many bosses as session memory keeps.
const MAX_BOSSES = 20
const MAX_PARTS = 20

interface Attempts {
  name: string
  count: number
  ids: string[]
}

export const attemptMilestones: CorrelationRule<Attempts> = {
  id: 'attempt_milestones',
  scope: 'single-player',
  listensTo: ['boss_encounter'],
  needs: 'confirmed',
  key: (e) => e.opponent.toLowerCase(),
  // Counted for the whole session.
  windowMs: Infinity,
  maxInstances: MAX_BOSSES,
  init: () => ({ name: '', count: 0, ids: [] }),
  step(state, event) {
    if (!event.opponent) return { state: null }
    const next: Attempts = {
      name: event.opponent,
      count: state.count + 1,
      ids: [...state.ids, event.id].slice(-MAX_PARTS)
    }
    if (!MILESTONES.includes(next.count)) return { state: next }
    return {
      state: next,
      emit: [
        {
          type: 'milestone',
          importance: 8,
          count: next.count,
          opponent: next.name,
          detail: `attempt ${next.count} at ${next.name}`,
          related: next.ids
        }
      ]
    }
  }
}
