// Speech recognition models and GameMate's voice.
import { handle } from '../system/security'
import { getSettings } from '../system/settings'
import { hushToast, sayInToast } from '../windows/toast'
import {
  downloadSpeechModel,
  isSpeechModelId,
  isSpeechModelInstalled,
  removeSpeechModel,
  speechModelStatuses
} from '../voice/voiceModels'
import { pickVoice } from '../../shared/voices'

export function registerVoiceHandlers(): void {
  handle('voice:models', () => speechModelStatuses())
  handle('voice:speak', (_event, text: unknown) => {
    if (typeof text !== 'string') return
    const settings = getSettings()
    const language = settings.language || 'en'
    const choice = pickVoice({
      language,
      engine: settings.voiceEngine,
      // Kokoro can't be downloaded until it can speak.
      installed: { kokoro: false, supertonic: isSpeechModelInstalled('supertonic') },
      kokoroVoice: settings.kokoroVoice,
      supertonicVoice: settings.naturalVoice
    })
    // The natural voices run in the pop-up window. Kokoro doesn't speak yet, and with no voice
    // for the language (or not downloaded) nothing is read aloud.
    if (choice.kind === 'supertonic') {
      const { voiceVolume: volume, voiceRate: speed } = settings
      sayInToast({ text, voice: choice.voice, speed, volume, language })
    }
  })
  handle('voice:stop', () => hushToast())
  handle('voice:download', (_event, id: unknown) => {
    if (isSpeechModelId(id)) downloadSpeechModel(id)
  })
  handle('voice:remove', (_event, id: unknown) =>
    isSpeechModelId(id) ? removeSpeechModel(id) : undefined
  )
}
