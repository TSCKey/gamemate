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
  it('list every Kokoro voice of the language, each with a Listen button', () => {
    models.list = [model('kokoro', true), model('supertonic', true)]
    const english = render({ language: 'en', voiceEngine: 'kokoro' })
    expect(english.match(/name="kokoro-voice"/g)).toHaveLength(28)
    expect(english.match(/>Listen</g)).toHaveLength(28)
    expect(english).toContain('George')
    expect(english).toContain('British English')
    expect(render({ language: 'fr', voiceEngine: 'kokoro' }).match(/>Listen</g)).toHaveLength(1)
    const german = render({ language: 'de', voiceEngine: 'kokoro' })
    expect(german).not.toContain('name="kokoro-voice"')
  })

  it('mark the voice the player chose, or the usual one where it doesn’t speak the language', () => {
    models.list = [model('kokoro', true), model('supertonic', true)]
    const checked = (html: string): string | undefined =>
      [...html.matchAll(/<input[^>]*name="kokoro-voice"[^>]*>/g)]
        .map((m) => m[0])
        .find((tag) => tag.includes('checked'))
        ?.match(/value="(\w+)"/)?.[1]
    expect(
      checked(render({ language: 'en', voiceEngine: 'kokoro', kokoroVoice: 'bm_george' }))
    ).toBe('bm_george')
    expect(
      checked(render({ language: 'es', voiceEngine: 'kokoro', kokoroVoice: 'bm_george' }))
    ).toBe('em_alex')
  })

  it('offer a voice that isn’t downloaded with one Download button, on its row', () => {
    models.list = [model('kokoro', false), model('supertonic', true)]
    const html = render({ language: 'en', voiceEngine: 'kokoro' })
    expect(html.match(/<button[^>]*class="primary"/g)).toHaveLength(1)
    expect(html).toContain('Download Kokoro once to use it.')
  })
})
