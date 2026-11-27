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
        kokoroVoice: 'af_heart',
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
  it('offer every Kokoro voice of the language in a dropdown, with a Listen button', () => {
    models.list = [model('kokoro', true), model('supertonic', true)]
    const english = render({ language: 'en', voiceEngine: 'kokoro' })
    const select =
      /<select[^>]*name="kokoro-voice"[^>]*>([\s\S]*?)<\/select>/.exec(english)?.[1] ?? ''
    expect(select.match(/<option/g)).toHaveLength(28)
    expect(select).toContain('<optgroup label="American English"')
    expect(select).toContain('<optgroup label="British English"')
    expect(select).toContain('George · Male')
    expect(english.match(/>Listen</g)).toHaveLength(1)
    const spanish = render({ language: 'es', voiceEngine: 'kokoro' })
    expect(spanish).not.toContain('<optgroup')
    expect(spanish.match(/<option[^>]*value="e[fm]_/g)).toHaveLength(3)
    const german = render({ language: 'de', voiceEngine: 'kokoro' })
    expect(german).not.toContain('name="kokoro-voice"')
  })

  it('select the voice the player chose, or the usual one where it doesn’t speak the language', () => {
    models.list = [model('kokoro', true), model('supertonic', true)]
    const selected = (html: string): string | undefined =>
      /<option[^>]*value="(\w+)"[^>]*selected=""/.exec(
        /name="kokoro-voice"[\s\S]*?<\/select>/.exec(html)?.[0] ?? ''
      )?.[1]
    expect(
      selected(render({ language: 'en', voiceEngine: 'kokoro', kokoroVoice: 'bm_george' }))
    ).toBe('bm_george')
    expect(
      selected(render({ language: 'es', voiceEngine: 'kokoro', kokoroVoice: 'bm_george' }))
    ).toBe('em_alex')
  })

  it('offer a voice that isn’t downloaded with one Download button, on its row', () => {
    models.list = [model('kokoro', false), model('supertonic', true)]
    const html = render({ language: 'en', voiceEngine: 'kokoro' })
    expect(html.match(/<button[^>]*class="primary"/g)).toHaveLength(1)
    expect(html).toContain('Download Kokoro once to use it.')
  })
})
