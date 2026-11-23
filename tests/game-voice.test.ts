// Each game's own commentary voice: what the game is, the words its players use, the words that
// make no sense in it, and what a shared moment means there.
import { describe, expect, it } from 'vitest'
import { offVoice, voiceFor } from '../src/main/companion/gameVoice'
import { reactionPrompt, type ReactionRequest } from '../src/main/companion/reaction'
import { makeEvent, type GameEvent, type VisionGame } from '../src/main/companion/events'
import { MatchMemory } from '../src/main/companion/matchMemory'
import { Commentator } from '../src/main/companion/commentator'

const game = (name: string, competitive = true): VisionGame => ({ id: name, name, competitive })

function prompt(name: string, event: GameEvent, competitive = true): string {
  const request: ReactionRequest = {
    game: game(name, competitive),
    language: 'en',
    tier: 'significant',
    mood: event.mood,
    events: [event],
    context: new MatchMemory().context(0),
    recent: [],
    intensity: 'normal',
    humor: 'light',
    tactical: false
  }
  return reactionPrompt(request)
}

describe('a voice for each game', () => {
  it('knows what a "death" read off the screen is in each game', () => {
    const death = makeEvent('death', 0, 'vision', { opponent: 'Foe', confidence: 1 })
    expect(prompt('Rocket League', death)).toContain(
      "An opponent demolished the player's car (they got demoed)"
    )
    expect(prompt('Rocket League', death)).toContain('The opponent involved is "Foe"')
    expect(prompt('Apex Legends', death)).toContain('whether they were knocked or eliminated')
    expect(prompt('VALORANT', death)).toContain('out until the next round')
    expect(prompt('Hollow Knight: Silksong', death, false)).toContain(
      'wakes again at the last bench'
    )
  })

  it('tells the writer what the game is and which words fit and which never do', () => {
    const text = prompt('Rocket League', makeEvent('goal_scored', 0, 'game'))
    expect(text).toContain('About Rocket League: Rocket League is car soccer')
    expect(text).toMatch(/Talk like a Rocket League player: words like goal, save, .*demo/)
    expect(text).toMatch(/never use them: kill, kills, killed/)
    // Before the instructions, where the fine-tuned writer reads it too.
    expect(text.indexOf('About Rocket League')).toBeLessThan(text.indexOf('How to react:'))
  })

  it('gives a game without its own voice a plain one that asks for its own words', () => {
    const voice = voiceFor(game('Elden Ring', false))
    expect(voice.avoid).toEqual([])
    expect(voice.about).toContain('the way its players do')
    expect(prompt('Elden Ring', makeEvent('death', 0, 'vision'), false)).toContain(
      'The player was eliminated or died.'
    )
  })

  it('finds a word that makes no sense in the game, whole words only', () => {
    const rocket = voiceFor(game('Rocket League'))
    expect(offVoice('Foe killed you there', rocket)).toBe('killed')
    expect(offVoice('Nice skill, clean demo!', rocket)).toBeNull()
    expect(offVoice('Two points! The score is 2-1!', rocket)).toBe('points')
    // A kill is a kill in VALORANT.
    expect(offVoice('Foe killed you there', voiceFor(game('VALORANT')))).toBeNull()
  })
})

describe('the companion keeps to the game’s words', () => {
  function harness(language: 'en' | 'de' = 'en'): {
    replies: string[]
    prompts: string[]
    said: string[]
    play: (event: GameEvent) => Promise<void>
  } {
    let clock = 0
    const replies: string[] = []
    const prompts: string[] = []
    const said: string[] = []
    const commentator = new Commentator({
      now: () => clock,
      generate: async (p) => {
        prompts.push(p)
        return replies.shift() ?? ''
      },
      deliver: (text) => said.push(text)
    })
    const rocket = game('Rocket League')
    return {
      replies,
      prompts,
      said,
      play: async (event) => {
        commentator.observe(
          {
            time: 0,
            source: 'game',
            phase: 'playing',
            inFight: false,
            score: null,
            description: '',
            events: [event]
          },
          rocket
        )
        clock = 5_000
        await commentator.speakIfDue({
          frequency: 'frequent',
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
          language,
          game: rocket
        })
      }
    }
  }

  it('redoes a line with a word that makes no sense, even for a small moment', async () => {
    const h = harness()
    h.replies.push('Foe killed you, ouch', 'Ouch, Foe caught you with a demo')
    await h.play(makeEvent('demolished', 0, 'game', { opponent: 'Foe' }))
    expect(h.prompts).toHaveLength(2)
    expect(h.prompts[1]).toContain('That last attempt said "killed"')
    expect(h.said).toEqual(['Ouch, Foe caught you with a demo'])
  })

  it('leaves other languages to the prompt', async () => {
    const h = harness('de')
    h.replies.push('Foe hat dich erwischt, killed')
    await h.play(makeEvent('demolished', 0, 'game', { opponent: 'Foe' }))
    expect(h.prompts).toHaveLength(1)
    expect(h.said).toHaveLength(1)
  })
})
