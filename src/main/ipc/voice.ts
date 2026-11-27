// Speech recognition models and GameMate's voice.
import { handle } from '../system/security'
import { getSettings, updateSettings } from '../system/settings'
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
  // 'noVoice' the first time the chat or a pop-up asks (options.notice) while the chosen voice
  // isn't downloaded, so it can tell the player once why nothing is read aloud.
  handle('voice:speak', (_event, text: unknown, options: unknown): 'noVoice' | undefined => {
    if (typeof text !== 'string') return
    const settings = getSettings()
    const language = settings.language || 'en'
    const choice = pickVoice({
      language,
      engine: settings.voiceEngine,
      installed: {
        kokoro: isSpeechModelInstalled('kokoro'),
        supertonic: isSpeechModelInstalled('supertonic')
      },
      kokoroVoice: settings.kokoroVoice,
      supertonicVoice: settings.naturalVoice
    })
    // The natural voices run in the pop-up window. With no voice for the language (or not
    // downloaded) nothing is read aloud.
    const { voiceVolume: volume, voiceRate: speed } = settings
    if (choice.kind === 'none') {
      const notice = (options as { notice?: unknown } | undefined)?.notice === true
      if (choice.reason !== 'notDownloaded' || !notice || settings.voiceNoticeShown) return
      updateSettings({ voiceNoticeShown: true })
      return 'noVoice'
    }
    if (settings.voiceNoticeShown) updateSettings({ voiceNoticeShown: false })
    if (choice.kind === 'kokoro') {
      sayInToast({ engine: 'kokoro', text, voice: choice.voice, speed, volume, language })
    } else {
      sayInToast({ engine: 'supertonic', text, voice: choice.voice, speed, volume, language })
    }
    return undefined
  })
  handle('voice:stop', () => hushToast())
  handle('voice:download', (_event, id: unknown) => {
    if (isSpeechModelId(id)) downloadSpeechModel(id)
  })
  handle('voice:remove', (_event, id: unknown) =>
    isSpeechModelId(id) ? removeSpeechModel(id) : undefined
  )
}
