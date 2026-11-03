// Which voice GameMate speaks with, per language. Shared by the main process and the windows.
import { languageInfo, type LanguageCode } from './languages'
import type { SupertonicVoice, VoiceEngine, WindowsVoice } from './types'

export type VoiceChoice =
  { kind: 'natural'; voice: SupertonicVoice } | { kind: 'windows'; name: string } | { kind: 'none' }

// The Windows voices that speak a language ('fr' matches 'fr-FR' and 'fr-CA').
export function windowsVoicesFor(language: LanguageCode, voices: WindowsVoice[]): WindowsVoice[] {
  return voices.filter((v) => v.language.split(/[-_]/)[0].toLowerCase() === language)
}

// Supertonic when it's chosen, installed and speaks the language; otherwise the chosen Windows
// voice if it speaks the language, else the first Windows voice that does, else none.
export function pickVoice(o: {
  language: LanguageCode
  engine: VoiceEngine
  naturalInstalled: boolean
  naturalVoice: SupertonicVoice
  voiceName: string
  windowsVoices: WindowsVoice[]
}): VoiceChoice {
  if (o.engine === 'natural' && o.naturalInstalled && languageInfo(o.language).naturalVoice) {
    return { kind: 'natural', voice: o.naturalVoice }
  }
  const speaking = windowsVoicesFor(o.language, o.windowsVoices)
  // GameMate 1.0.3 saved the older System.Speech names ("Microsoft Zira Desktop").
  const voice =
    speaking.find((v) => v.name === o.voiceName || o.voiceName.startsWith(`${v.name} `)) ??
    speaking[0]
  return voice ? { kind: 'windows', name: voice.name } : { kind: 'none' }
}
