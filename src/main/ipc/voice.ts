// Speech recognition models and GameMate's voice.
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

export function registerVoiceHandlers(): void {
  handle('voice:models', () => speechModelStatuses())
  handle('voice:voices', () => listVoices())
  handle('voice:speak', (_event, text: unknown) => {
    if (typeof text !== 'string') return
    const { voiceEngine, voiceName, voiceVolume, voiceRate, language } = getSettings()
    // The natural voice runs in the pop-up window; Windows' voices run here.
    const natural =
      voiceEngine === 'kokoro' &&
      isSpeechModelInstalled('supertonic') &&
      sayInToast({
        text,
        voice: 'F1',
        speed: voiceRate,
        volume: voiceVolume,
        language: language || 'en'
      })
    if (!natural) speak(text, { voice: voiceName, volume: voiceVolume, rate: voiceRate })
  })
  handle('voice:stop', () => {
    stopSpeaking()
    hushToast()
  })
  handle('voice:download', (_event, id: unknown) => {
    if (isSpeechModelId(id)) downloadSpeechModel(id)
  })
  handle('voice:remove', (_event, id: unknown) =>
    isSpeechModelId(id) ? removeSpeechModel(id) : undefined
  )
}
