// Rocket League from its Stats API: the game's settings file, the local socket, and what its
// messages (shaped as in https://www.rocketleague.com/developer/stats-api) become.
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseStatsIni, readStatsConfig, StatsFeed } from '../src/main/games/rocketStats'
import { RocketWatch, type RocketMessage } from '../src/main/companion/rocketReading'
import { Commentator } from '../src/main/companion/commentator'
import type { GameEvent } from '../src/main/companion/events'

const INI = (rate: number, webPort = 49124): string =>
  [
    '[TAGame.MatchStatsExporter_TA]',
    '',
    '; Port the client will listen for tcp connections on',
    'Port=49123',
    `WebPort=${webPort}`,
    `PacketSendRate=${rate}`
  ].join('\r\n')

describe("the game's Stats API setting", () => {
  it('is off as the game ships it, and on with a send rate', () => {
    expect(parseStatsIni(INI(0))).toEqual({ enabled: false, webPort: 49124 })
    expect(parseStatsIni(INI(30, 50000))).toEqual({ enabled: true, webPort: 50000 })
  })

  it('reads TAStatsAPI.ini first, and DefaultStatsAPI.ini when it isn’t there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamemate-rl-'))
    mkdirSync(join(dir, 'TAGame', 'Config'), { recursive: true })
    expect(readStatsConfig(dir)).toBeNull()
    writeFileSync(join(dir, 'TAGame', 'Config', 'DefaultStatsAPI.ini'), INI(0))
    expect(readStatsConfig(dir)?.enabled).toBe(false)
    writeFileSync(join(dir, 'TAGame', 'Config', 'TAStatsAPI.ini'), INI(10))
    expect(readStatsConfig(dir)?.enabled).toBe(true)
  })
})

class FakeSocket {
  onopen: (() => void) | null = null
  onmessage: ((m: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  sent: unknown[] = []
  close(): void {
    this.closed = true
  }
  send(data: unknown): void {
    this.sent.push(data)
  }
}

describe('listening to the game', () => {
  it('connects to the local port, queues messages in order, keeps only the newest state', () => {
    const sockets: { url: string; socket: FakeSocket }[] = []
    const feed = new StatsFeed((url) => {
      const socket = new FakeSocket()
      sockets.push({ url, socket })
      return socket as unknown as WebSocket
    })
    feed.ensure(49124, 0)
    expect(sockets[0].url).toBe('ws://127.0.0.1:49124')
    sockets[0].socket.onopen?.()
    expect(feed.connected).toBe(true)
    const say = (m: object | string): void =>
      sockets[0].socket.onmessage?.({ data: typeof m === 'string' ? m : JSON.stringify(m) })
    say({ Event: 'UpdateState', Data: { n: 1 } })
    say({ Event: 'UpdateState', Data: { n: 2 } })
    say('not json')
    say({ Event: 'GoalScored', Data: {} })
    say({ Event: 'UpdateState', Data: { n: 3 } })
    expect(feed.drain().map((m) => `${m.Event}${(m.Data as { n?: number }).n ?? ''}`)).toEqual([
      'UpdateState2',
      'GoalScored',
      'UpdateState3'
    ])
    // Only listens: nothing is ever sent to the game.
    expect(sockets[0].socket.sent).toEqual([])
  })

  it('tries again every few seconds while the game isn’t listening, and closes when asked', () => {
    let opened = 0
    const feed = new StatsFeed(() => {
      opened++
      const socket = new FakeSocket()
      queueMicrotask(() => socket.onclose?.())
      return socket as unknown as WebSocket
    })
    feed.ensure(49124, 0)
    feed.ensure(49124, 1_000)
    expect(opened).toBe(1)
    feed.close()
    expect(feed.status).toBe('off')
    feed.ensure(49124, 20_000)
    expect(opened).toBe(2)
  })
})

// A match: the player TSCKey (blue, team 0) with Mate; Rival and Foe in orange.
const GUID = 'A1B2'
const p = (Name: string, TeamNum: number): { Name: string; Shortcut: number; TeamNum: number } => ({
  Name,
  Shortcut: 1,
  TeamNum
})
const state = (
  blue: number,
  orange: number,
  TimeSeconds = 200,
  bOvertime = false
): RocketMessage => ({
  Event: 'UpdateState',
  Data: {
    MatchGuid: GUID,
    Players: [p('TSCKey', 0), p('Mate', 0), p('Rival', 1), p('Foe', 1)].map((x) => ({
      ...x,
      Goals: 0
    })),
    Game: {
      Teams: [
        { Name: 'Blue', TeamNum: 0, Score: blue },
        { Name: 'Orange', TeamNum: 1, Score: orange }
      ],
      TimeSeconds,
      bOvertime,
      bHasTarget: true,
      Target: p('TSCKey', 0)
    }
  }
})
const goal = (scorer: string, team: number, assister?: string): RocketMessage => ({
  Event: 'GoalScored',
  Data: {
    MatchGuid: GUID,
    GoalSpeed: 87.3,
    Scorer: p(scorer, team),
    ...(assister ? { Assister: p(assister, team) } : {}),
    BallLastTouch: { Player: p(scorer, team), Speed: 125 }
  }
})
const stat = (EventName: string, main: string, second?: string): RocketMessage => ({
  Event: 'StatfeedEvent',
  Data: {
    MatchGuid: GUID,
    EventName,
    Type: EventName,
    MainTarget: p(main, main === 'TSCKey' || main === 'Mate' ? 0 : 1),
    ...(second ? { SecondaryTarget: p(second, 1) } : {})
  }
})

function play(
  script: [number, RocketMessage][],
  watch = new RocketWatch(),
  names = ['TSCKey']
): GameEvent[] {
  return script.flatMap(([t, m]) => watch.absorb(m, t * 1000, names))
}
const kinds = (events: GameEvent[]): string[] =>
  events.map((e) => `${e.type}${e.count > 1 ? e.count : ''}${e.opponent ? `(${e.opponent})` : ''}`)

describe('goals', () => {
  it('tells the player’s goal, set up by a teammate, and what made it matter', () => {
    const events = play([
      [0, state(0, 1)],
      [10, { Event: 'RoundStarted', Data: { MatchGuid: GUID } }],
      [40, goal('TSCKey', 0, 'Mate')]
    ])
    expect(kinds(events)).toEqual(['goal_scored(Mate)'])
    expect(events[0].basis).toBe('telemetry')
    expect(events[0].detail).toMatch(/it ties the game/)
    expect(events[0].detail).toMatch(/set up by Mate/)
    expect(events[0].detail).toMatch(/The score is 1-1/)
    expect(events[0].data?.matchGuid).toBe(GUID)
  })

  it('makes an overtime goal and a hat trick the biggest moments', () => {
    const events = play([
      [0, state(2, 2, 0, true)],
      [5, goal('TSCKey', 0)]
    ])
    expect(kinds(events)).toEqual(['overtime_started', 'goal_scored'])
    expect(events[1].tier).toBe('exceptional')
    expect(events[1].detail).toMatch(/in overtime: it wins the match/)

    const trick = play([
      [0, state(0, 0)],
      [30, goal('TSCKey', 0)],
      [120, goal('TSCKey', 0)],
      [240, goal('TSCKey', 0)]
    ])
    expect(trick.map((e) => e.count)).toEqual([1, 2, 3])
    expect(trick[2].detail).toMatch(/hat trick/)
    expect(trick[2].tier).toBe('exceptional')
  })

  it('tells a last-second goal and a goal straight from the kickoff', () => {
    const late = play([
      [0, state(1, 1, 3)],
      [1, goal('TSCKey', 0)]
    ])
    expect(late[late.length - 1].detail).toMatch(/in the last seconds/)
    const kickoff = play([
      [0, state(0, 0)],
      [10, { Event: 'RoundStarted', Data: {} }],
      [15, goal('TSCKey', 0)]
    ])
    expect(kickoff[0].detail).toMatch(/straight from the kickoff/)
  })

  it('tells an assist, a teammate’s goal and a goal against apart', () => {
    const events = play([
      [0, state(0, 0)],
      [10, goal('Mate', 0, 'TSCKey')],
      [60, goal('Mate', 0)],
      [90, goal('Rival', 1)]
    ])
    expect(kinds(events)).toEqual([
      'goal_assist(Mate)',
      'teammate_goal(Mate)',
      'goal_conceded(Rival)'
    ])
  })
})

describe('the game’s own stat events', () => {
  it('tells saves, an epic save and a stand of saves, and demolitions both ways', () => {
    const events = play([
      [0, state(0, 0)],
      [10, stat('Save', 'TSCKey')],
      [14, stat('EpicSave', 'TSCKey')],
      [40, stat('Demolish', 'TSCKey', 'Rival')],
      [60, stat('Demolish', 'Foe', 'TSCKey')]
    ])
    expect(kinds(events)).toEqual([
      'save',
      'epic_save',
      'defensive_stand2',
      'demolition(Rival)',
      'demolished(Foe)'
    ])
    expect(events[2].related).toEqual([events[0].id, events[1].id])
  })

  it('leaves others’ stats and the stats a goal tells alone, and notes names it doesn’t know', () => {
    const watch = new RocketWatch()
    const events = play(
      [
        [0, state(0, 0)],
        [5, stat('Save', 'Mate')],
        [6, stat('Shot', 'Rival')],
        [7, stat('Goal', 'TSCKey')],
        [7, stat('HatTrick', 'TSCKey')],
        [8, stat('MysteryStat', 'TSCKey')]
      ],
      watch
    )
    expect(events).toEqual([])
    expect([...watch.unknownStats]).toEqual(['MysteryStat'])
  })

  it('tells the player’s shot only when no goal of theirs follows', () => {
    const watch = new RocketWatch()
    const missed = play(
      [
        [0, state(0, 0)],
        [10, stat('Shot', 'TSCKey')]
      ],
      watch
    )
    expect(missed).toEqual([])
    expect(kinds(watch.tick(15_000))).toEqual([])
    const told = watch.tick(18_000)
    expect(kinds(told)).toEqual(['shot_on_goal'])
    expect(told[0].time).toBe(10_000)
    // A shot that went in is the goal.
    const scored = play(
      [
        [30, stat('Shot', 'TSCKey')],
        [31, goal('TSCKey', 0)]
      ],
      watch
    )
    expect(kinds(scored)).toEqual(['goal_scored'])
    expect(watch.tick(60_000)).toEqual([])
  })

  it('tells the player’s centers, clears, kickoff touches, named moves and awards', () => {
    const events = play([
      [0, state(0, 0)],
      [3, stat('FirstTouch', 'TSCKey')],
      [20, stat('Center', 'TSCKey')],
      [30, stat('Clear', 'TSCKey')],
      [40, stat('AerialHit', 'TSCKey')],
      [50, stat('BicycleHit', 'Rival')],
      [60, stat('Playmaker', 'TSCKey')]
    ])
    expect(kinds(events)).toEqual([
      'first_touch',
      'ball_centered',
      'ball_cleared',
      'mechanic',
      'milestone'
    ])
    expect(events[3].detail).toBe('The game named it an aerial hit.')
    expect(events[4].detail).toMatch(/^Playmaker: three assists/)
  })

  it('puts the goal mechanic the game named into the player’s goal, whichever comes first', () => {
    const before = play([
      [0, state(0, 0)],
      [10, stat('AerialGoal', 'TSCKey')],
      [10, goal('TSCKey', 0)]
    ])
    expect(kinds(before)).toEqual(['goal_scored'])
    expect(before[0].detail).toMatch(/the game named it an aerial goal/)
    const after = play([
      [0, state(0, 0)],
      [10, goal('TSCKey', 0)],
      [11, stat('BicycleGoal', 'TSCKey')]
    ])
    expect(kinds(after)).toEqual(['goal_scored', 'mechanic'])
    expect(after[1].detail).toBe("The player's goal: the game named it a bicycle goal.")
  })

  it('tells a comeback once the team is level after being two goals down', () => {
    const events = play([
      [0, state(0, 0)],
      [10, goal('Rival', 1)],
      [20, goal('Foe', 1)],
      [30, goal('Mate', 0)],
      [40, goal('TSCKey', 0)],
      [50, goal('Rival', 1)],
      [60, goal('Mate', 0)]
    ])
    expect(kinds(events)).toEqual([
      'goal_conceded(Rival)',
      'goal_conceded(Foe)',
      'teammate_goal(Mate)',
      'goal_scored',
      'comeback',
      'goal_conceded(Rival)',
      'teammate_goal(Mate)'
    ])
    expect(events[4].detail).toMatch(/^Level again after being 2 goals behind/)
  })

  it('marks what was read off the screen as checked on screen, a little less sure', () => {
    const events = play(
      [
        [0, state(0, 0)],
        [10, stat('EpicSave', 'TSCKey')]
      ],
      new RocketWatch('screen', 0.9)
    )
    expect(events[0]).toMatchObject({
      type: 'epic_save',
      source: 'screen',
      basis: 'verified',
      confidence: 0.9
    })
  })

  it('tells the player’s shot off the crossbar', () => {
    const events = play([
      [0, state(0, 0)],
      [
        5,
        {
          Event: 'CrossbarHit',
          Data: { BallSpeed: 870, BallLastTouch: { Player: p('TSCKey', 0), Speed: 120 } }
        }
      ],
      [9, { Event: 'CrossbarHit', Data: { BallLastTouch: { Player: p('Rival', 1) } } }]
    ])
    expect(kinds(events)).toEqual(['crossbar_hit'])
  })
})

describe('the match', () => {
  it('tells the last thirty seconds of a close game once, and overtime once', () => {
    const events = play([
      [0, state(1, 1, 45)],
      [15, state(1, 1, 30)],
      [20, { Event: 'ClockUpdatedSeconds', Data: { TimeSeconds: 25, bOvertime: false } }],
      [50, state(1, 1, 0, true)],
      [51, { Event: 'ClockUpdatedSeconds', Data: { TimeSeconds: 0, bOvertime: true } }]
    ])
    expect(kinds(events)).toEqual(['final_seconds', 'overtime_started'])
  })

  it('says nothing about the last seconds of a game already decided', () => {
    expect(play([[0, state(4, 0, 20)]])).toEqual([])
  })

  it('tells a win after being two goals down as a comeback, and a loss as a defeat', () => {
    const comeback = play([
      [0, state(0, 0)],
      [10, goal('Rival', 1)],
      [20, goal('Foe', 1)],
      [60, goal('TSCKey', 0)],
      [90, goal('Mate', 0)],
      [120, goal('TSCKey', 0)],
      [130, { Event: 'MatchEnded', Data: { MatchGuid: GUID, WinnerTeamNum: 0 } }]
    ])
    expect(kinds(comeback).slice(-2)).toEqual(['comeback', 'victory'])
    expect(comeback[comeback.length - 1].detail).toBe("Final score 3-2 (player's team first).")
    const lost = play([
      [0, state(0, 1)],
      [5, { Event: 'MatchEnded', Data: { WinnerTeamNum: 1 } }]
    ])
    expect(kinds(lost)).toEqual(['defeat'])
  })

  it('knows the player by the car the game shows when no name is set', () => {
    const events = play(
      [
        [0, state(0, 0)],
        [5, stat('Save', 'TSCKey')]
      ],
      new RocketWatch(),
      []
    )
    expect(kinds(events)).toEqual(['save'])
  })

  it('starts over with a new match', () => {
    const watch = new RocketWatch()
    play(
      [
        [0, state(0, 0)],
        [5, goal('TSCKey', 0)],
        [6, goal('TSCKey', 0)]
      ],
      watch
    )
    const next = play(
      [
        [100, { Event: 'MatchCreated', Data: { MatchGuid: 'NEW' } }],
        [101, { ...state(0, 0), Data: { ...state(0, 0).Data, MatchGuid: 'NEW' } }],
        [130, { ...goal('TSCKey', 0), Data: { ...goal('TSCKey', 0).Data, MatchGuid: 'NEW' } }]
      ],
      watch
    )
    expect(next[0].count).toBe(1)
    expect(watch.state().score).toEqual([1, 0])
  })
})

describe('what the companion says', () => {
  it('speaks for the goal, naming the teammate who set it up as a teammate', async () => {
    let clock = 0
    const prompts: string[] = []
    const commentator = new Commentator({
      now: () => clock,
      generate: async (prompt) => {
        prompts.push(prompt)
        return 'What a finish that was'
      },
      deliver: () => {}
    })
    const watch = new RocketWatch()
    const game = { id: 'rl', name: 'Rocket League', competitive: true }
    for (const [t, message] of [
      [0, state(0, 0)],
      [30, goal('TSCKey', 0, 'Mate')]
    ] as [number, RocketMessage][]) {
      clock = t * 1000
      const events = watch.absorb(message, clock, ['TSCKey'])
      commentator.observe(
        {
          time: clock,
          source: 'game',
          phase: 'playing',
          inFight: false,
          score: null,
          description: '',
          events
        },
        game
      )
    }
    clock = 34_000
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
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatch(/The teammate involved is "Mate"/)
    expect(prompts[0]).not.toMatch(/enemy involved/)
  })
})
