import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../src/shared/types'

// The handlers GameMate registers, called here as the windows would.
const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
vi.mock('../src/main/system/security', () => ({
  handle: (channel: string, listener: (...args: unknown[]) => unknown) =>
    handlers.set(channel, listener)
}))
vi.mock('electron', () => ({ shell: {} }))

const current = vi.hoisted(() => ({ settings: {} as Partial<Settings> }))
vi.mock('../src/main/system/settings', () => ({ getSettings: () => current.settings }))

const sayInToast = vi.hoisted(() => vi.fn(() => true))
vi.mock('../src/main/windows/toast', () => ({ sayInToast, hushToast: () => {} }))

const installed = vi.hoisted(() => new Set<string>())
vi.mock('../src/main/voice/voiceModels', () => ({
  isSpeechModelInstalled: (id: string) => installed.has(id),
  isSpeechModelId: () => true,
  downloadSpeechModel: () => {},
  removeSpeechModel: () => {},
  speechModelStatuses: () => []
}))

const { registerVoiceHandlers } = await import('../src/main/ipc/voice')
registerVoiceHandlers()
const speak = (text: string): unknown => handlers.get('voice:speak')?.({}, text)

describe('reading aloud', () => {
  beforeEach(() => {
    sayInToast.mockClear()
    installed.clear()
    installed.add('supertonic')
    current.settings = {
      language: 'de',
      voiceEngine: 'supertonic',
      kokoroVoice: 'female',
      naturalVoice: 'M2',
      voiceVolume: 0.5,
      voiceRate: 1.2
    }
  })

  it('says it with Supertonic in the pop-up window', async () => {
    await speak('Guter Schuss!')
    expect(sayInToast).toHaveBeenCalledWith({
      text: 'Guter Schuss!',
      voice: 'M2',
      speed: 1.2,
      volume: 0.5,
      language: 'de'
    })
  })

  it('says nothing while Supertonic isn’t downloaded', async () => {
    installed.clear()
    await speak('Guter Schuss!')
    expect(sayInToast).not.toHaveBeenCalled()
  })

  it('says nothing when Kokoro is chosen, which can’t speak yet', async () => {
    current.settings = { ...current.settings, language: 'en', voiceEngine: 'kokoro' }
    installed.add('kokoro')
    await speak('Nice shot!')
    expect(sayInToast).not.toHaveBeenCalled()
  })

  it('has no Windows voices to list or add any more', () => {
    expect(handlers.has('voice:voices')).toBe(false)
    expect(handlers.has('voice:open-windows-voices')).toBe(false)
  })
})
