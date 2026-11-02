import { describe, expect, it } from 'vitest'
import { decide, type QuestionInfo } from './router'

const ask = (question: string, extra: Partial<QuestionInfo> = {}): boolean =>
  decide({ question, hasImages: false, messages: 1, mentionsItem: false, ...extra }).cloud

describe('Auto mode', () => {
  it('sends screenshots to Gemini', () => {
    expect(ask('what is this?', { hasImages: true })).toBe(true)
  })

  it('keeps recipes for known items local', () => {
    expect(ask('how do I craft a piston', { mentionsItem: true })).toBe(false)
  })

  it('sends questions that need thinking to Gemini', () => {
    expect(ask('how do I beat the ender dragon')).toBe(true)
    expect(ask('what is the best way to farm iron')).toBe(true)
  })

  it('keeps quick questions local', () => {
    expect(ask('what does a creeper drop')).toBe(false)
  })

  it('sends long questions and long conversations to Gemini', () => {
    expect(ask(Array.from({ length: 30 }, () => 'word').join(' '))).toBe(true)
    expect(ask('and then?', { messages: 9 })).toBe(true)
  })
})
