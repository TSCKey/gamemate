// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Settings, SpeechModelStatus } from '../src/shared/types'

// The panel's voice downloads, as GameMate would report them once loaded.
const models = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>()
  return {
    ...react,
    useState: (initial: unknown) =>
      Array.isArray(initial) ? [models.list, () => {}] : react.useState(initial)
  }
})

const { setupI18n } = await import('../src/renderer/src/i18n')
const { default: VoicePanel } = await import('../src/renderer/src/components/VoicePanel')
setupI18n()

const model = (id: 'kokoro' | 'supertonic', installed: boolean): SpeechModelStatus =>
  ({
    id,
    kind: 'speak',
    sizeMb: 300,
    installed,
    englishOnly: false,
    progress: null,
    error: null,
    repo: ''
  }) as SpeechModelStatus

const render = (settings: Partial<Settings>): string =>
  renderToString(
    createElement(VoicePanel, {
      settings: {
        voiceInput: false,
        speechModel: 'accurate',
        speakAnswers: 'voice',
        speakComments: false,
        kokoroVoice: 'female',
        naturalVoice: 'F1',
        voiceVolume: 1,
        voiceRate: 1,
        voiceShortcut: 'Alt+V',
        ...settings
      } as Settings,
      update: () => {},
      appInfo: null
    })
  )

describe('the Voice settings', () => {
  it('offer Kokoro’s female and male voice only where Kokoro speaks the language', () => {
    models.list = [model('kokoro', true), model('supertonic', true)]
    const english = render({ language: 'en', voiceEngine: 'kokoro' })
    expect(english).toContain('value="male"')
    const german = render({ language: 'de', voiceEngine: 'kokoro' })
    expect(german).not.toContain('value="male"')
  })

  it('offer a voice that isn’t downloaded with one Download button, on its row', () => {
    models.list = [model('kokoro', false), model('supertonic', true)]
    const html = render({ language: 'en', voiceEngine: 'kokoro' })
    expect(html.match(/<button[^>]*class="primary"/g)).toHaveLength(1)
    expect(html).toContain('Download Kokoro once to use it.')
  })
})
