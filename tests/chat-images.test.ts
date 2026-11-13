import { describe, expect, it } from 'vitest'
import { withLatestScreenshotOnly } from '../src/shared/chat'

describe('the conversation sent with a question', () => {
  it('carries only the screenshot of the question being asked', () => {
    const history = [
      { role: 'user' as const, content: 'What is this?', images: ['old'] },
      { role: 'assistant' as const, content: 'A creeper.' },
      { role: 'user' as const, content: 'And this?', images: ['new'] }
    ]
    const sent = withLatestScreenshotOnly(history)
    expect(sent[0]).toEqual({ role: 'user', content: 'What is this?' })
    expect(sent[2].images).toEqual(['new'])
    // The window keeps its own copy, with the pictures it shows.
    expect(history[0].images).toEqual(['old'])
  })

  it('leaves a conversation without screenshots as it is', () => {
    const history: { role: 'user'; content: string; images?: string[] }[] = [
      { role: 'user', content: 'Hi' }
    ]
    expect(withLatestScreenshotOnly(history)).toEqual(history)
  })
})
