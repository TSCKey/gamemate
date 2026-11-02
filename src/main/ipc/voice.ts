// Speech recognition models and GameMate's voice.
import { handle } from '../security'
import { getSettings } from '../settings'
import { hushToast, sayInToast } from '../toast'
import { listVoices, speak, stopSpeaking } from '../tts'
import {
  downloadSpeechModel,
  isSpeechModelId,
  isSpeechModelInstalled,
  removeSpeechModel,
  speechModelStatuses
} from '../voiceModels'

export function registerVoiceHandlers(): void {
  handle('voice:models', () => speechModelStatuses())
  handle('voice:voices', () => listVoices())
  handle('voice:speak', (_event, text: unknown) => {
    if (typeof text !== 'string') return
    const { voiceEngine, kokoroVoice, voiceName, voiceVolume, voiceRate } = getSettings()
    // The natural voice runs in the pop-up window; Windows' voices run here.
    const natural =
      voiceEngine === 'kokoro' &&
      isSpeechModelInstalled('kokoro') &&
      sayInToast({ text, voice: kokoroVoice, speed: voiceRate, volume: voiceVolume })
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
