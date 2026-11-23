// How GameMate talks about each game: what the game is, the words its players use, the words that
// make no sense in it, and what the shared moments (a "kill", a "death") actually are there. The
// companion's personality stays the same everywhere; only its language and understanding of the
// game change. A "kill" read off Rocket League's screen is a demolition, and nobody dies in it.
//
// To give a newly supported game its own voice, add an entry to VOICES. A game without one gets a
// plain voice that tells the writer to use that game's own words, and to describe a moment plainly
// rather than guess at a term.
import type { GameEventType, VisionGame } from './events'

export interface GameVoice {
  // What the game is and how its players talk about it, in a sentence or two.
  about: string
  // Words that belong to the game, for the writer to reach for.
  words: string[]
  // Words that make no sense in this game (English, whole words): a comment using one is redone.
  avoid: string[]
  // What the player's opponents are called, in the singular ("opponent", "enemy").
  other: string
  // What a moment means in this game, where the general meaning would read wrong.
  meanings?: Partial<Record<GameEventType, string>>
}

const VOICES: { name: RegExp; voice: GameVoice }[] = [
  {
    name: /^rocket league$/i,
    voice: {
      about:
        "Rocket League is car soccer: two teams of rocket-powered cars try to knock a giant ball into the other team's goal. Cars boost, jump and fly (aerials), and ramming a car at full speed blows it up for a few seconds (a demo). Nobody gets hurt or dies.",
      words: [
        'goal',
        'save',
        'shot',
        'the ball',
        'the net',
        'demo',
        'demoed',
        'aerial',
        'kickoff',
        'boost',
        'touch',
        'overtime'
      ],
      avoid: [
        'kill',
        'kills',
        'killed',
        'killing',
        'die',
        'died',
        'dies',
        'dead',
        'death',
        'eliminated',
        'elimination',
        'enemy',
        'enemies',
        'gun',
        'weapon',
        // A goal is a goal: the small writer called one "two points".
        'points'
      ],
      other: 'opponent',
      meanings: {
        kill: "The player demolished an opponent's car (a demo): it blew up and is out of the play for a few seconds.",
        death:
          "An opponent demolished the player's car (they got demoed): it respawns in a few seconds.",
        multikill: 'The player demoed several opponents in quick succession.',
        kill_streak: 'The player has demoed several opponents without getting demoed themselves.',
        victory: 'The player’s team won the match.',
        defeat: 'The player’s team lost the match.'
      }
    }
  },
  {
    name: /^apex legends$/i,
    voice: {
      about:
        "Apex Legends is a squad battle royale: squads of three (or two) drop onto a map and fight to be the last squad standing, the champions, while a ring closes in. A downed player is knocked and can be revived; an eliminated player's squad can bring them back at a respawn beacon with their banner. Shields break before health.",
      words: [
        'knocked',
        'eliminated',
        'squad',
        'squad wipe',
        'shields',
        'cracked',
        'third party',
        'ring',
        'revive',
        'respawn beacon',
        'banner',
        'champions',
        'kill leader'
      ],
      avoid: ['goal', 'goals', 'round', 'rounds', 'boss'],
      other: 'enemy',
      meanings: {
        kill: 'The player downed an enemy; the facts say whether it was a knock or an elimination.',
        death: 'The player was taken down; the facts say whether they were knocked or eliminated.',
        low_health: "The player's health is critical and their shield is gone.",
        victory: "The player's squad won the match: they are the champions.",
        defeat: "The player's squad is out of the match."
      }
    }
  },
  {
    name: /^valorant$/i,
    voice: {
      about:
        'VALORANT is a tactical 5v5 shooter played in rounds: attackers plant the spike and defenders defuse it, or a team wins the round by taking out the other. Each agent has abilities. Dead players sit out until the next round.',
      words: [
        'round',
        'kill',
        'frag',
        'clutch',
        'ace',
        'spike',
        'plant',
        'defuse',
        'eco',
        'entry',
        'trade'
      ],
      avoid: ['goal', 'goals', 'knocked', 'squad wipe', 'boss', 'respawn', 'respawned'],
      other: 'enemy',
      meanings: {
        death: 'The player was killed and is out until the next round.'
      }
    }
  },
  {
    name: /^hollow knight: silksong$/i,
    voice: {
      about:
        "Hollow Knight: Silksong is a 2D action platformer: the player is Hornet, exploring a hostile kingdom and fighting bosses. Health is shown as masks; resting at a bench saves progress, and after dying Hornet wakes at the last bench she rested at. The game's moments are hits taken, close calls, bosses, new areas and deaths.",
      words: ['mask', 'masks', 'boss', 'bench', 'hit', 'area', 'Hornet', 'attack'],
      avoid: [
        'eliminated',
        'elimination',
        'squad',
        'round',
        'rounds',
        'goal',
        'goals',
        'frag',
        'knocked',
        'respawn',
        'respawned',
        'gun'
      ],
      other: 'enemy',
      meanings: {
        death: 'Hornet (the player) died; she wakes again at the last bench she rested at.',
        low_health: 'Hornet (the player) is down to her last mask of health.',
        recovery: 'Hornet (the player) was down to her last mask a moment ago and has more again.'
      }
    }
  },
  {
    name: /^minecraft/i,
    voice: {
      about:
        'Minecraft is a sandbox survival game: the player gathers, builds, crafts and explores, and hostile mobs (zombies, skeletons, creepers) come out in the dark. Dying drops what they carried where they died, and they respawn at their bed or the world spawn.',
      words: ['mob', 'mobs', 'creeper', 'build', 'craft', 'biome', 'village', 'cave'],
      avoid: ['eliminated', 'elimination', 'squad', 'round', 'rounds', 'goal', 'goals', 'frag'],
      other: 'mob'
    }
  },
  {
    name: /^fortnite$/i,
    voice: {
      about:
        'Fortnite is a battle royale: players drop onto an island, loot, build cover and fight while the storm closes in, and the last one (or last team) standing gets a Victory Royale. A downed player in a team mode can be revived.',
      words: ['eliminated', 'storm', 'build', 'loot', 'Victory Royale', 'knocked', 'revive'],
      avoid: ['goal', 'goals', 'round', 'rounds', 'boss', 'ring'],
      other: 'opponent',
      meanings: {
        victory: 'The player got a Victory Royale: they won the match.'
      }
    }
  },
  {
    name: /^counter-strike/i,
    voice: {
      about:
        'Counter-Strike is a tactical 5v5 shooter played in rounds: terrorists plant the bomb and counter-terrorists defuse it, or a side wins by taking out the other. Dead players sit out until the next round.',
      words: ['round', 'kill', 'frag', 'clutch', 'ace', 'bomb', 'plant', 'defuse', 'eco', 'trade'],
      avoid: ['goal', 'goals', 'knocked', 'boss', 'respawn', 'respawned'],
      other: 'enemy',
      meanings: {
        death: 'The player was killed and is out until the next round.'
      }
    }
  },
  {
    name: /^overwatch/i,
    voice: {
      about:
        'Overwatch is a 5v5 hero shooter: teams fight over objectives (pushing a payload, holding a point) and fallen heroes respawn after a few seconds. Heroes have abilities and ultimates.',
      words: ['elimination', 'payload', 'point', 'objective', 'ult', 'team fight', 'respawn'],
      avoid: ['goal', 'goals', 'knocked', 'squad wipe', 'boss'],
      other: 'enemy'
    }
  },
  {
    name: /^league of legends$/i,
    voice: {
      about:
        "League of Legends is a 5v5 MOBA: each player controls a champion, the teams push lanes, take towers and objectives like dragons and Baron, and win by destroying the other team's Nexus. Dead champions respawn after a timer.",
      words: ['champion', 'lane', 'tower', 'dragon', 'Baron', 'team fight', 'kill', 'Nexus'],
      avoid: ['goal', 'goals', 'knocked', 'squad wipe', 'round', 'rounds'],
      other: 'enemy'
    }
  }
]

// The voice for a game, or a plain one for a game without its own.
export function voiceFor(game: Pick<VisionGame, 'name' | 'competitive'>): GameVoice {
  const known = VOICES.find((v) => v.name.test(game.name.trim()))
  if (known) return known.voice
  return {
    about: `Talk about ${game.name} the way its players do. If you're not sure what a moment is called in ${game.name}, describe it plainly instead of borrowing a word from another game.`,
    words: [],
    avoid: [],
    other: game.competitive ? 'opponent' : 'enemy'
  }
}

// The first word of the comment that doesn't fit the game, or null. English only: the lists are
// English words, and for other languages the prompt has to do the work.
export function offVoice(text: string, voice: GameVoice): string | null {
  for (const word of voice.avoid) {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(text)) return word
  }
  return null
}
