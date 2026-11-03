// Speech recognition models and GameMate's voice.
import { shell } from 'electron'
import { handle } from '../system/security'
import { getSettings } from '../system/settings'
import { hushToast, sayInToast } from '../windows/toast'
import { listVoices, speak, stopSpeaking } from '../voice/tts'
import {
  downloadSpeechModel,
  isSpeechModelId,
  isSpeechModelInstalled,
  removeSpeechModel,
  speechModelStatuses
} from '../voice/voiceModels'
import { pickVoice, type VoiceChoice } from '../../shared/voices'
import type { VoiceEngine, WindowsVoice } from '../../shared/types'

// Windows' voices, asked for once; asked again whenever Settings → Voice shows them (a voice may
// have been added under Windows' Settings → Speech in the meantime).
let windowsVoices: Promise<WindowsVoice[]> | null = null
function voices(refresh = false): Promise<WindowsVoice[]> {
  if (refresh || !windowsVoices) windowsVoices = listVoices({ refresh })
  return windowsVoices
}

export function registerVoiceHandlers(): void {
  handle('voice:models', () => speechModelStatuses())
  handle('voice:voices', () => voices(true))
  handle('voice:speak', async (_event, text: unknown) => {
    if (typeof text !== 'string') return
    const settings = getSettings()
    const language = settings.language || 'en'
    const windows = await voices()
    const pick = (engine: VoiceEngine): VoiceChoice =>
      pickVoice({
        language,
        engine,
        naturalInstalled: isSpeechModelInstalled('supertonic'),
        naturalVoice: settings.naturalVoice,
        voiceName: settings.voiceName,
        windowsVoices: windows
      })
    const { voiceVolume: volume, voiceRate: speed } = settings
    let choice = pick(settings.voiceEngine)
    // The natural voice runs in the pop-up window; Windows' voices run here. Without the
    // pop-up window, a Windows voice for the language speaks instead.
    if (choice.kind === 'natural') {
      if (sayInToast({ text, voice: choice.voice, speed, volume, language })) return
      choice = pick('windows')
    }
    if (choice.kind === 'windows') speak(text, { voice: choice.name, volume, rate: speed })
  })
  handle('voice:stop', () => {
    stopSpeaking()
    hushToast()
  })
  // Windows' page for adding voices in more languages.
  handle('voice:open-windows-voices', () => shell.openExternal('ms-settings:speech'))
  handle('voice:download', (_event, id: unknown) => {
    if (isSpeechModelId(id)) downloadSpeechModel(id)
  })
  handle('voice:remove', (_event, id: unknown) =>
    isSpeechModelId(id) ? removeSpeechModel(id) : undefined
  )
}
