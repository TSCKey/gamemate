// Single-player: after dying several times in one area, the player reached an area they had not
// been to before this session. Only "new" areas count, so respawning at a bench somewhere known
// is not taken for getting through. It never claims anything was beaten.
import type { CorrelationRule } from '../correlation'

interface Progress {
  area: string
  deaths: string[]
  visited: string[]
}

const MIN_DEATHS = 3
const MAX_PARTS = 20
const MAX_AREAS = 40
const SESSION_STRETCH_MS = 30 * 60_000

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

export const newAreaAfterDeaths: CorrelationRule<Progress> = {
  id: 'new_area_after_deaths',
  scope: 'single-player',
  listensTo: ['area_entered', 'death'],
  needs: 'confirmed',
  windowMs: SESSION_STRETCH_MS,
  init: () => ({ area: '', deaths: [], visited: [] }),
  step(state, event) {
    if (event.type === 'death') {
      const place = event.place || state.area
      if (!place) return { state }
      if (!same(place, state.area)) return { state: { ...state, area: place, deaths: [event.id] } }
      return { state: { ...state, deaths: [...state.deaths, event.id].slice(-MAX_PARTS) } }
    }
    const place = event.place
    if (!place || same(place, state.area)) return { state }
    const known = state.visited.some((v) => same(v, place))
    const visited = (known ? state.visited : [...state.visited, place]).slice(-MAX_AREAS)
    const next: Progress = { area: place, deaths: [], visited }
    if (known || state.deaths.length < MIN_DEATHS || !state.area) return { state: next }
    return {
      state: next,
      emit: [
        {
          type: 'new_area_after_deaths',
          place,
          count: state.deaths.length,
          detail: `reached ${place} after dying ${state.deaths.length} times in ${state.area}`,
          related: [...state.deaths, event.id],
          data: { from: state.area }
        }
      ]
    }
  }
}
