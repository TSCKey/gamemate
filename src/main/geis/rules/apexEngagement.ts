// Apex Legends: one fight told as one moment instead of a comment per knock. A fight is the squad's
// combat with no gap longer than the window. It is told when it ends (it goes quiet, or a squad
// is wiped) and only when it is worth more than its parts:
// - a clutch: the player knocked or eliminated someone with the rest of the squad down, and the
//   fight ended with an elimination and the player alive;
// - a chaotic fight won: eliminations or a squad wiped despite setbacks (the player knocked or
//   critically low, a teammate down, another squad joining), with enough going on;
// - an escape: the player was critically low, nothing was won, and the fight went quiet with the
//   player alive. How they got out isn't known, and isn't said.
// The player's death ends a fight with nothing to add: the death says it. Its parts stay in the
// log, pointed at by `related`.
import type { CorrelationRule, Derived } from '../correlation'
import type { GameEvent } from '../../companion/events'

interface Fight {
  ids: string[]
  shields: number
  knocks: number
  kills: number
  wiped: boolean
  playerKnocked: boolean
  teammatesDown: number
  thirdParty: boolean
  // The player's health was critical (the bars), and teammates were revived during the fight.
  critical: boolean
  revives: number
  // The player knocked or eliminated someone with the rest of the squad down.
  aloneHit: boolean
}

const FIGHT_MS = 25_000
// Parts of a fight before it is a chaotic one (shield breaks, knocks, eliminations).
const BUSY = 3

function told(fight: Fight): Derived[] {
  const won = fight.kills > 0 || fight.wiped
  if (!won) {
    if (!fight.critical) return []
    return [
      {
        type: 'successful_escape',
        detail: 'Critically low during the fight, and still alive now that it has gone quiet.',
        related: fight.ids,
        importance: 8
      }
    ]
  }
  if (fight.aloneHit) {
    return [
      {
        type: 'clutch',
        detail:
          'Won the fight with the rest of the squad down: the player got knocks or eliminations alone.',
        related: fight.ids,
        importance: 10
      }
    ]
  }
  const setbacks = [
    fight.playerKnocked && 'the player was knocked and got back up',
    fight.critical && !fight.playerKnocked && 'the player was critically low',
    fight.teammatesDown > 0 &&
      `${fight.teammatesDown === 1 ? 'a teammate' : `${fight.teammatesDown} teammates`} went down`,
    fight.thirdParty && 'another squad joined'
  ].filter((s): s is string => typeof s === 'string')
  const action = fight.shields + fight.knocks + fight.kills
  if (setbacks.length === 0 || action < BUSY) return []
  const revived =
    fight.revives > 0 ? `, ${fight.revives === 1 ? 'a teammate' : 'teammates'} revived` : ''
  return [
    {
      type: 'chaotic_fight_victory',
      detail: `Came out on top of a messy fight: ${setbacks.join(', ')}; ${fight.knocks} knock(s), ${fight.kills} elimination(s)${fight.wiped ? ', a squad wiped' : ''}${revived}.`,
      related: fight.ids,
      count: fight.kills,
      importance: 9
    }
  ]
}

const apex = (event: GameEvent): boolean => event.adapterId === 'apex'

export const apexEngagement: CorrelationRule<Fight> = {
  id: 'apex_engagement',
  scope: 'competitive',
  listensTo: [
    'shield_break',
    'knock',
    'kill',
    'team_wipe',
    'teammate_down',
    'player_knocked',
    'third_party',
    'low_health',
    'player_shield_broken',
    'heavy_damage',
    'teammate_revived',
    'death'
  ],
  // The text reader's readings are copied text, not checks of the game's data.
  needs: 'any',
  windowMs: FIGHT_MS,
  init: () => ({
    ids: [],
    shields: 0,
    knocks: 0,
    kills: 0,
    wiped: false,
    playerKnocked: false,
    teammatesDown: 0,
    thirdParty: false,
    critical: false,
    revives: 0,
    aloneHit: false
  }),
  step(state, event) {
    if (!apex(event)) return { state }
    if (event.type === 'death') return { state: null }
    const fight = { ...state, ids: [...state.ids, event.id] }
    const alone = event.data?.alone === true
    switch (event.type) {
      case 'shield_break':
        fight.shields++
        break
      case 'knock':
        fight.knocks++
        if (alone) fight.aloneHit = true
        break
      case 'kill':
        fight.kills++
        if (alone) fight.aloneHit = true
        break
      case 'teammate_down':
        fight.teammatesDown++
        break
      case 'player_knocked':
        fight.playerKnocked = true
        break
      case 'third_party':
        fight.thirdParty = true
        break
      case 'low_health':
        fight.critical = true
        break
      case 'teammate_revived':
        fight.revives++
        break
      case 'team_wipe':
        fight.wiped = true
        // A wiped squad ends this fight: told now, and a new one may start.
        return { state: null, emit: told(fight) }
    }
    return { state: fight }
  },
  close(state, reason) {
    return reason === 'expired' ? told(state) : []
  }
}
