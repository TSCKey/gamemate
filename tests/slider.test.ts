// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Slider } from '../src/renderer/src/components/ui'

describe('a settings slider', () => {
  it('shows the saved value and reports only when let go', () => {
    const html = renderToString(
      createElement(Slider, {
        value: 0.4,
        min: 0,
        max: 1,
        step: 0.05,
        label: 'Volume',
        onCommit: () => {}
      })
    )
    expect(html).toContain('type="range"')
    expect(html).toContain('value="0.4"')
    expect(html).toContain('aria-label="Volume"')
  })
})
