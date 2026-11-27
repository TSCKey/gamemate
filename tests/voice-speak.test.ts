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
vi.mock('../src/main/system/settings', () => ({
  getSettings: () => current.settings,
  updateSettings: (patch: Partial<Settings>) =>
    (current.settings = { ...current.settings, ...patch })
}))

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
const speak = (text: string, options?: unknown): unknown =>
  handlers.get('voice:speak')?.({}, text, options)

describe('reading aloud', () => {
  beforeEach(() => {
    sayInToast.mockClear()
    installed.clear()
    installed.add('supertonic')
    current.settings = {
      language: 'de',
      voiceEngine: 'supertonic',
      kokoroVoice: 'af_heart',
      naturalVoice: 'M2',
      voiceVolume: 0.5,
      voiceRate: 1.2
    }
  })

  it('says it with Supertonic in the pop-up window', async () => {
    await speak('Guter Schuss!')
    expect(sayInToast).toHaveBeenCalledWith({
      engine: 'supertonic',
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

  it('says it with Kokoro in the pop-up window, in the language’s voice', async () => {
    current.settings = { ...current.settings, language: 'es', voiceEngine: 'kokoro' }
    installed.add('kokoro')
    await speak('¡Buen tiro!')
    expect(sayInToast).toHaveBeenCalledWith({
      engine: 'kokoro',
      text: '¡Buen tiro!',
      voice: 'ef_dora',
      speed: 1.2,
      volume: 0.5,
      language: 'es'
    })
    current.settings = { ...current.settings, language: 'en', kokoroVoice: 'am_michael' }
    await speak('Nice shot!')
    expect(sayInToast).toHaveBeenLastCalledWith(
      expect.objectContaining({ engine: 'kokoro', voice: 'am_michael', language: 'en' })
    )
  })

  it('says a sample with the Kokoro voice the player wants to hear, without choosing it', async () => {
    current.settings = { ...current.settings, language: 'en', voiceEngine: 'kokoro' }
    installed.add('kokoro')
    await speak('Hi!', { kokoroVoice: 'bm_george' })
    expect(sayInToast).toHaveBeenLastCalledWith(
      expect.objectContaining({ engine: 'kokoro', voice: 'bm_george', language: 'en' })
    )
    expect(current.settings.kokoroVoice).toBe('af_heart')
    await speak('Hi!', { kokoroVoice: '../evil' })
    expect(sayInToast).toHaveBeenLastCalledWith(expect.objectContaining({ voice: 'af_heart' }))
  })

  it('says nothing while Kokoro isn’t downloaded', async () => {
    current.settings = { ...current.settings, language: 'en', voiceEngine: 'kokoro' }
    await speak('Nice shot!')
    expect(sayInToast).not.toHaveBeenCalled()
  })

  it('says nothing with Kokoro in a language it can’t speak', async () => {
    current.settings = { ...current.settings, language: 'de', voiceEngine: 'kokoro' }
    installed.add('kokoro')
    await speak('Guter Schuss!')
    expect(sayInToast).not.toHaveBeenCalled()
  })

  it('tells a chat once that no voice is downloaded', async () => {
    installed.clear()
    current.settings = { ...current.settings, voiceNoticeShown: false }
    expect(await speak('Guter Schuss!', { notice: true })).toBe('noVoice')
    expect(current.settings.voiceNoticeShown).toBe(true)
    // Only once: the flag is saved with the settings.
    expect(await speak('Noch einer!', { notice: true })).toBeUndefined()
  })

  it('leaves the notice for a window that can show it', async () => {
    installed.clear()
    current.settings = { ...current.settings, voiceNoticeShown: false }
    // The Voice settings' test button explains it on the spot.
    expect(await speak('Hallo!')).toBeUndefined()
    expect(current.settings.voiceNoticeShown).toBe(false)
  })

  it('says nothing about it when the voice can’t speak the language', async () => {
    current.settings = { ...current.settings, voiceEngine: 'kokoro', voiceNoticeShown: false }
    installed.add('kokoro')
    expect(await speak('Guter Schuss!', { notice: true })).toBeUndefined()
    expect(current.settings.voiceNoticeShown).toBe(false)
  })

  it('tells again after a voice was downloaded and removed', async () => {
    current.settings = { ...current.settings, voiceNoticeShown: true }
    await speak('Guter Schuss!', { notice: true })
    expect(sayInToast).toHaveBeenCalled()
    expect(current.settings.voiceNoticeShown).toBe(false)
    installed.clear()
    expect(await speak('Guter Schuss!', { notice: true })).toBe('noVoice')
  })

  it('has no Windows voices to list or add any more', () => {
    expect(handlers.has('voice:voices')).toBe(false)
    expect(handlers.has('voice:open-windows-voices')).toBe(false)
  })
})
