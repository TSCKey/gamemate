// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const { setupI18n } = await import('../src/renderer/src/i18n')
const { default: i18n } = await import('i18next')
const { PatchNotesWindow } = await import('../src/renderer/src/components/PatchNotesWindow')
setupI18n()

const notes = [
  { version: '0.5.0', markdown: '## Voices\n\n- **New** voice' },
  { version: '0.4.0', markdown: 'Eight languages.' }
]
const render = (): string =>
  renderToString(createElement(PatchNotesWindow, { notes, onClose: () => {} }))

describe('the What’s new window', () => {
  it('is titled with the newest version and lists each version, newest first', () => {
    const html = render()
    expect(html).toContain('What’s new in GameMate 0.5.0')
    expect(html.indexOf('GameMate 0.5.0', html.indexOf('</h2>'))).toBeLessThan(
      html.indexOf('GameMate 0.4.0')
    )
    expect(html).toContain('<strong>New</strong>')
    expect(html).toContain('Eight languages.')
    expect(html).toMatch(/<button[^>]*>Close<\/button>/)
  })

  it('reads right to left in Arabic', async () => {
    await i18n.changeLanguage('ar')
    expect(render()).toContain('dir="rtl"')
    await i18n.changeLanguage('en')
  })
})
