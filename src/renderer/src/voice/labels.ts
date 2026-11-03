// Names for Supertonic's voices in the player's language: "Female 1" … "Male 5".
import type { SupertonicVoice } from '../../../shared/types'
import type { Translate } from '../../../shared/i18n'
import { t } from '../i18n'

export function naturalVoiceLabel(voice: SupertonicVoice, translate: Translate = t): string {
  const key = voice.startsWith('F')
    ? 'voicePanel.naturalVoices.female'
    : 'voicePanel.naturalVoices.male'
  return translate(key, { number: voice.slice(1) })
}
