// Single-player: in a boss fight, the player was down to the last mask and got back above it
// without dying. Seen through the mask count only, so it says nothing about how (no dodges, no
// healing): those can't be seen with the light checks.
import type { CorrelationRule } from '../correlation'

interface Fight {
  boss: string
  bossId: string
  // The close call still waiting for its outcome, if any.
  lowId: string
}

const FIGHT_MS = 5 * 60_000

export const closeCallSurvived: CorrelationRule<Fight> = {
  id: 'close_call_survived',
  scope: 'single-player',
  listensTo: ['boss_encounter', 'low_health', 'recovery', 'death', 'area_entered'],
  needs: 'confirmed',
  windowMs: FIGHT_MS,
  endsWithFight: true,
  init: () => ({ boss: '', bossId: '', lowId: '' }),
  step(state, event) {
    switch (event.type) {
      case 'boss_encounter':
        return event.opponent
          ? { state: { boss: event.opponent, bossId: event.id, lowId: '' } }
          : { state: null }
      case 'low_health':
        return state.boss ? { state: { ...state, lowId: event.id } } : { state: null }
      case 'recovery':
        if (!state.boss || !state.lowId) return { state }
        return {
          state: { ...state, lowId: '' },
          emit: [
            {
              type: 'close_call_survived',
              opponent: state.boss,
              detail: `back above the last mask against ${state.boss}`,
              related: [state.bossId, state.lowId, event.id]
            }
          ]
        }
      default:
        // A death or a new area ends the fight.
        return { state: null }
    }
  }
}
