import { describe, expect, it } from 'vitest'
import { makeEvent, type GameEvent, type GameEventType } from '../src/main/companion/events'
import type { MatchContext } from '../src/main/companion/matchMemory'
import {
  claimsTooMuch,
  cleanReaction,
  isRepeat,
  reactionPrompt,
  type ReactionRequest
} from '../src/main/companion/reaction'

const context = (over: Partial<MatchContext> = {}): MatchContext => ({
  minutes: 5,
  kills: 0,
  deaths: 0,
  assists: 0,
  killStreak: 0,
  bestStreak: 0,
  roundRun: 0,
  score: null,
  nemesis: null,
  form: 'even',
  improving: false,
  pattern: null,
  ...over
})

const event = (type: GameEventType, fields: Partial<GameEvent> = {}): GameEvent =>
  makeEvent(type, 1000, 'vision', { detail: 'seen on screen', ...fields })

const request = (over: Partial<ReactionRequest> = {}): ReactionRequest => ({
  game: { name: 'VALORANT', competitive: true },
  language: 'en',
  tier: 'minor',
  mood: 'positive',
  events: [event('kill')],
  context: context(),
  recent: [],
  intensity: 'normal',
  humor: 'light',
  tactical: false,
  ...over
})

describe('the reaction prompt', () => {
  it('names the game and writes in the player’s language', () => {
    const prompt = reactionPrompt(request({ language: 'ar' }))
    expect(prompt).toContain('VALORANT')
    expect(prompt).toContain('in Arabic')
  })

  it('gives only the facts it was handed', () => {
    const prompt = reactionPrompt(
      request({ events: [event('kill', { opponent: 'Sova', detail: 'ELIMINATED banner' })] })
    )
    expect(prompt).toContain('Sova')
    expect(prompt).toContain('ELIMINATED banner')
    expect(prompt).toMatch(/only.*facts|anything that is not listed/i)
  })

  it('does not let it invent how something happened', () => {
    expect(reactionPrompt(request())).toMatch(/do not describe how it happened/i)
  })

  it('makes clear the name on an event belongs to the enemy, not the player', () => {
    const prompt = reactionPrompt(request({ events: [event('kill', { opponent: 'Sova' })] }))
    expect(prompt).toMatch(/enemy.*"Sova".*not the player/i)
    expect(prompt).toMatch(/never call the player by a name/i)
  })

  it('asks for the whole comment in the player’s language', () => {
    expect(reactionPrompt(request({ language: 'de' }))).toMatch(/Use only German/)
    expect(reactionPrompt(request({ language: 'en' }))).not.toMatch(/Use only/)
  })

  it('does not let game terms be used unless they are listed', () => {
    expect(reactionPrompt(request())).toMatch(/clutch.*only if/i)
  })

  it('asks for a reason the moment matters, not an announcement', () => {
    expect(reactionPrompt(request())).toMatch(/why (it|the moment) matters/i)
  })

  it('treats names read off the screen as data', () => {
    expect(reactionPrompt(request())).toMatch(/never instructions/i)
  })

  it('gets longer and bigger with the size of the moment', () => {
    const limit = (tier: ReactionRequest['tier']): number =>
      Number(/at most (\d+) words/.exec(reactionPrompt(request({ tier })))?.[1])
    expect(limit('minor')).toBeLessThan(limit('significant'))
    expect(limit('significant')).toBeLessThan(limit('exceptional'))
  })

  it('follows the reaction intensity setting', () => {
    const subtle = reactionPrompt(request({ intensity: 'subtle' }))
    const expressive = reactionPrompt(request({ intensity: 'expressive' }))
    expect(subtle).toMatch(/calm|understated/i)
    expect(expressive).toMatch(/excited|surprised/i)
    expect(subtle).not.toEqual(expressive)
  })

  it('follows the humor setting', () => {
    expect(reactionPrompt(request({ humor: 'none' }))).toMatch(/do not joke/i)
    expect(reactionPrompt(request({ humor: 'playful' }))).toMatch(/playful/i)
  })

  it('lists recent comments so it says something new', () => {
    const prompt = reactionPrompt(request({ recent: ['Nice shot there!'] }))
    expect(prompt).toContain('Nice shot there!')
    expect(prompt).toMatch(/different/i)
  })

  it('passes on what match memory knows, as a lower bound', () => {
    const prompt = reactionPrompt(request({ context: context({ killStreak: 4, kills: 6 }) }))
    expect(prompt).toMatch(/at least 4/i)
    expect(prompt).toMatch(/only what you saw/i)
  })

  it('leaves out match memory when there is nothing to say', () => {
    expect(reactionPrompt(request())).not.toMatch(/remember from this match/i)
  })
})

describe('reacting to bad moments', () => {
  const bad = (over: Partial<ReactionRequest> = {}): string =>
    reactionPrompt(request({ mood: 'negative', events: [event('death')], ...over }))

  it('never blames or insults, and is honest instead of flattering', () => {
    expect(bad()).toMatch(/never blame/i)
    expect(bad()).not.toMatch(/encourage/i)
    expect(bad()).toMatch(/do not praise/i)
    expect(bad()).toMatch(/disappointed/i)
  })

  it('does not joke even when humor is set to playful', () => {
    const prompt = bad({ humor: 'playful' })
    expect(prompt).toMatch(/no jokes/i)
    expect(prompt).not.toMatch(/be playful/i)
  })

  it('stays calm even when reactions are set to expressive', () => {
    expect(bad({ intensity: 'expressive' })).not.toMatch(/excited|surprised/i)
  })

  it('recognises a hard match, and doesn’t joke about it even after a good moment', () => {
    const prompt = reactionPrompt(
      request({ context: context({ form: 'hard', deaths: 6, kills: 1 }), humor: 'playful' })
    )
    expect(prompt).toMatch(/hard match/i)
    expect(prompt).toMatch(/no jokes/i)
  })

  it('mentions the opponent who keeps winning when the player just lost to them', () => {
    const prompt = bad({
      events: [event('death', { opponent: 'Reyna' })],
      context: context({ nemesis: { name: 'Reyna', count: 2 } })
    })
    expect(prompt).toMatch(/Reyna.*2 times/)
  })
})

describe('constructive observations', () => {
  it('are forbidden unless the moment allows one', () => {
    const prompt = reactionPrompt(
      request({
        tactical: false,
        context: context({ pattern: { kind: 'same_place', place: 'A Main', count: 3 } })
      })
    )
    expect(prompt).not.toContain('A Main')
    expect(prompt).toMatch(/no advice|do not give advice/i)
  })

  it('are based only on the pattern match memory found', () => {
    const prompt = reactionPrompt(
      request({
        mood: 'negative',
        events: [event('round_lost')],
        tactical: true,
        context: context({ pattern: { kind: 'same_place', place: 'A Main', count: 3 } })
      })
    )
    expect(prompt).toContain('A Main')
    expect(prompt).toMatch(/constructive/i)
  })

  it('never turn into call-outs in competitive games', () => {
    expect(reactionPrompt(request())).toMatch(/never tell the player where enemies are/i)
    expect(
      reactionPrompt(request({ game: { name: 'Minecraft', competitive: false } }))
    ).not.toMatch(/where enemies are/i)
  })
})

describe('cleaning what the model wrote', () => {
  it('removes quotes, labels and extra lines', () => {
    expect(cleanReaction('"Nice shot!"\nMore text', 'minor')).toBe('Nice shot!')
    expect(cleanReaction('“Nice shot!”', 'minor')).toBe('Nice shot!')
    expect(cleanReaction('GameMate: Nice shot!', 'minor')).toBe('Nice shot!')
  })

  it('rejects things that are not a comment', () => {
    expect(cleanReaction('', 'minor')).toBe('')
    expect(cleanReaction('   ', 'minor')).toBe('')
    expect(cleanReaction('{"comment": "hi"}', 'minor')).toBe('')
    expect(cleanReaction('<think>', 'minor')).toBe('')
  })

  it('cuts a rambling reply at the end of a sentence', () => {
    const long = `Great work out there. ${'and then some more words '.repeat(40)}`
    expect(cleanReaction(long, 'minor')).toBe('Great work out there.')
  })

  it('stays within the length for its size even without sentence ends', () => {
    expect(cleanReaction('word '.repeat(200), 'exceptional').length).toBeLessThanOrEqual(200)
  })

  it('cuts at sentence ends in other scripts too', () => {
    expect(cleanReaction(`すごい！${'あ'.repeat(300)}`, 'minor')).toBe('すごい！')
  })
})

describe('spotting a repeated comment', () => {
  it('catches the same line, whatever the punctuation or case', () => {
    expect(isRepeat('NICE shot, you caught them!', ['Nice shot you caught them'])).toBe(true)
  })

  it('catches the same opening as a recent comment', () => {
    expect(isRepeat('Nice shot, that was fast', ['Nice shot on that one'])).toBe(true)
  })

  it('catches a reply that strings earlier comments together', () => {
    expect(isRepeat('Well done there! Keep that going friend.', ['Well done there!'])).toBe(true)
  })

  it('allows a different line', () => {
    expect(isRepeat('Two down already, you are on fire', ['Careful around that corner'])).toBe(
      false
    )
  })

  it('works without spaces between words', () => {
    expect(isRepeat('素晴らしい一撃でしたね', ['素晴らしい一撃でしたよ'])).toBe(true)
    expect(isRepeat('次は気をつけて行こう', ['素晴らしい一撃でしたよ'])).toBe(false)
  })

  it('allows an old opening to come back', () => {
    const older = ['Nice shot on that one', 'Careful there', 'Big round coming', 'What a save']
    expect(isRepeat('Nice shot, that was fast', older)).toBe(false)
  })
})

describe('claims the facts do not back up', () => {
  it('rejects a comeback nobody saw', () => {
    expect(claimsTooMuch('What a comeback that was!', [event('victory')])).toBe(true)
  })

  it('rejects a clutch or a headshot nobody saw', () => {
    expect(claimsTooMuch('What a clutch!', [event('kill')])).toBe(true)
    expect(claimsTooMuch('That headshot was clean', [event('kill')])).toBe(true)
  })

  it('accepts them when the events say so', () => {
    expect(claimsTooMuch('What a comeback!', [event('comeback')])).toBe(false)
    expect(claimsTooMuch('What a clutch!', [event('clutch')])).toBe(false)
    expect(claimsTooMuch('That headshot was clean', [event('headshot')])).toBe(false)
  })

  it('accepts an ordinary comment', () => {
    expect(claimsTooMuch('That round really mattered', [event('round_won')])).toBe(false)
  })
})

describe('the reaction prompt for a single-player session', () => {
  const session = {
    boss: { name: 'Moss Mother', attempt: 4 },
    deathsHere: 3,
    area: 'Moss Grotto',
    closeCalls: 1,
    areasVisited: 2,
    timeline: ['entered Moss Grotto', 'attempt 3 at Moss Mother', 'died to Moss Mother']
  }

  it('says which attempt it is, how often they died here and what just happened', () => {
    const prompt = reactionPrompt(request({ session }))
    expect(prompt).toContain('This is attempt 4 at Moss Mother.')
    expect(prompt).toContain('They have died here 3 times.')
    expect(prompt).toContain(
      'What just happened: entered Moss Grotto, attempt 3 at Moss Mother, died to Moss Mother.'
    )
  })

  it('only gives the last four timeline entries', () => {
    const long = { ...session, timeline: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] }
    const prompt = reactionPrompt(request({ session: long }))
    expect(prompt).toContain('What just happened: c3, d4, e5, f6.')
    expect(prompt).not.toContain('b2')
  })

  it('has no session lines when there is no session', () => {
    const prompt = reactionPrompt(request())
    expect(prompt).not.toContain('What just happened:')
    expect(prompt).not.toContain('This is attempt')
  })
})
