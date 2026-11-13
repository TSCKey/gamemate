import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, getSession, updateSession } from '../src/main/system/session'

describe('what the main window was showing', () => {
  beforeEach(() => clearSession())

  it('outlives the window: closing it to the tray keeps "Remind me later" and the chat', () => {
    updateSession({ featuresLater: true })
    updateSession({ messages: [{ role: 'user', content: 'Hi' }] })
    // A new window asks for it when it opens.
    expect(getSession()).toEqual({
      featuresLater: true,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  })

  it('is kept without the screenshots, which a closed window has no use for', () => {
    updateSession({ messages: [{ role: 'user', content: 'What is this?', images: ['abc'] }] })
    expect(getSession().messages).toEqual([{ role: 'user', content: 'What is this?' }])
  })

  it('ignores anything else a page sends', () => {
    updateSession({ featuresLater: 'yes', messages: 'none', other: 1 })
    updateSession(null)
    expect(getSession()).toEqual({ featuresLater: false, messages: [] })
  })

  it('is forgotten with "Delete my data"', () => {
    updateSession({ featuresLater: true, messages: [{ role: 'user', content: 'Hi' }] })
    clearSession()
    expect(getSession()).toEqual({ featuresLater: false, messages: [] })
  })
})
