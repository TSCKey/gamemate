import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// Right-to-left rules a render test can't see: they live in the stylesheet.
const css = readFileSync(join(__dirname, '../src/renderer/src/assets/main.css'), 'utf8')
const rule = (selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start))
}

describe('right-to-left layout', () => {
  it('keeps crafting grids as they are in the game', () => {
    expect(rule('.recipe-grid')).toContain('direction: ltr')
    // The arrow follows the direction of the text around it, not the page's.
    expect(css).toContain('.recipe-arrow:dir(rtl)')
    expect(css).not.toContain("[dir='rtl'] .recipe-arrow")
  })

  it('gives each line of an answer its own direction', () => {
    expect(rule("[dir='auto']")).toContain('unicode-bidi: plaintext')
  })

  it('puts the line beside the data-sending features on the side the text starts', () => {
    const group = rule('.feature-choices .feature-group')
    expect(group).toContain('padding-inline-start')
    expect(group).toContain('border-inline-start')
    expect(group).not.toMatch(/(padding|border)-(left|right)/)
    expect(group).not.toMatch(/padding: \S+ \S+ \S+ \S+/)
  })
})
