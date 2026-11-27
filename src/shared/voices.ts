// Which voice GameMate speaks with, per language. Shared by the main process and the windows.
import { languageInfo, type LanguageCode, type NaturalVoiceEngine } from './languages'
import type { KokoroVoice, SupertonicVoice, VoiceEngine } from './types'

export type VoiceChoice =
  | { kind: 'kokoro'; voice: string }
  | { kind: 'supertonic'; voice: SupertonicVoice }
  // Nothing is read aloud: the chosen voice isn't downloaded, or doesn't speak the language.
  | { kind: 'none'; reason: 'notDownloaded' | 'cantSpeak' }

// Kokoro's voice files, per language it speaks. French has no male voice.
const KOKORO_VOICE_IDS: Partial<Record<LanguageCode, Record<KokoroVoice, string>>> = {
  en: { female: 'af_heart', male: 'am_michael' },
  es: { female: 'ef_dora', male: 'em_alex' },
  fr: { female: 'ff_siwis', male: 'ff_siwis' },
  it: { female: 'if_sara', male: 'im_nicola' },
  pt: { female: 'pf_dora', male: 'pm_alex' }
}

// Every Kokoro voice file GameMate uses, once each.
export const KOKORO_VOICE_FILES: readonly string[] = [
  ...new Set(Object.values(KOKORO_VOICE_IDS).flatMap((ids) => Object.values(ids)))
]

// The Kokoro voice for a language, or null where Kokoro doesn't speak it.
export function kokoroVoiceId(language: LanguageCode, voice: KokoroVoice): string | null {
  return KOKORO_VOICE_IDS[language]?.[voice] ?? null
}

// The chosen voice if it speaks the language and is downloaded; otherwise none, and why.
export function pickVoice(o: {
  language: LanguageCode
  engine: VoiceEngine
  installed: Record<NaturalVoiceEngine, boolean>
  kokoroVoice: KokoroVoice
  supertonicVoice: SupertonicVoice
}): VoiceChoice {
  if (!languageInfo(o.language).voices.includes(o.engine))
    return { kind: 'none', reason: 'cantSpeak' }
  if (!o.installed[o.engine]) return { kind: 'none', reason: 'notDownloaded' }
  if (o.engine === 'supertonic') return { kind: 'supertonic', voice: o.supertonicVoice }
  const voice = kokoroVoiceId(o.language, o.kokoroVoice)
  return voice ? { kind: 'kokoro', voice } : { kind: 'none', reason: 'cantSpeak' }
}

// The natural voice a player gets for a language: Kokoro where it speaks it, otherwise
// Supertonic (null if neither does).
export function naturalVoiceFor(language: LanguageCode): NaturalVoiceEngine | null {
  const { voices } = languageInfo(language)
  if (voices.includes('kokoro')) return 'kokoro'
  return voices.includes('supertonic') ? 'supertonic' : null
}
