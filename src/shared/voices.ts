// Which voice GameMate speaks with, per language. Shared by the main process and the windows.
import { languageInfo, type LanguageCode, type NaturalVoiceEngine } from './languages'
import type { SupertonicVoice, VoiceEngine } from './types'

export type VoiceChoice =
  | { kind: 'kokoro'; voice: string }
  | { kind: 'supertonic'; voice: SupertonicVoice }
  // Nothing is read aloud: the chosen voice isn't downloaded, or doesn't speak the language.
  | { kind: 'none'; reason: 'notDownloaded' | 'cantSpeak' }

export interface KokoroVoiceInfo {
  // Kokoro's voice file, e.g. 'bm_george': its first letter is the language (and accent), the
  // second the gender.
  id: string
  // The voice's own name, the same in every language.
  name: string
  language: LanguageCode
  // American or British, for English.
  accent?: 'us' | 'gb'
  gender: 'female' | 'male'
}

const LANGUAGE_OF: Record<string, Pick<KokoroVoiceInfo, 'language' | 'accent'>> = {
  a: { language: 'en', accent: 'us' },
  b: { language: 'en', accent: 'gb' },
  e: { language: 'es' },
  f: { language: 'fr' },
  i: { language: 'it' },
  p: { language: 'pt' }
}

// Kokoro 1.0's voices in the languages GameMate speaks. In each language the first female and
// the first male voice are its usual ones.
const KOKORO_VOICE_IDS: readonly string[] = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole',
  'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_michael', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_onyx', 'am_puck',
  'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  'ef_dora', 'em_alex', 'em_santa',
  'ff_siwis',
  'if_sara', 'im_nicola',
  'pf_dora', 'pm_alex', 'pm_santa'
] // prettier-ignore

export const KOKORO_VOICE_LIST: readonly KokoroVoiceInfo[] = KOKORO_VOICE_IDS.map((id) => ({
  id,
  name: id[3].toUpperCase() + id.slice(4),
  ...LANGUAGE_OF[id[0]],
  gender: id[1] === 'm' ? 'male' : 'female'
}))

// Every Kokoro voice file GameMate downloads.
export const KOKORO_VOICE_FILES: readonly string[] = KOKORO_VOICE_IDS

export function isKokoroVoice(value: unknown): value is string {
  return typeof value === 'string' && KOKORO_VOICE_IDS.includes(value)
}

// Kokoro's voices in a language (none where Kokoro doesn't speak it).
export function kokoroVoicesFor(language: LanguageCode): KokoroVoiceInfo[] {
  return KOKORO_VOICE_LIST.filter((v) => v.language === language)
}

// The Kokoro voice for a language: the chosen one if it speaks the language, else the usual
// voice of the same gender there (French has only a female one); null where Kokoro doesn't
// speak the language.
export function kokoroVoiceId(language: LanguageCode, chosen: string): string | null {
  const voices = kokoroVoicesFor(language)
  if (voices.some((v) => v.id === chosen)) return chosen
  const gender = chosen[1] === 'm' ? 'male' : 'female'
  return (voices.find((v) => v.gender === gender) ?? voices[0])?.id ?? null
}

// The chosen voice if it speaks the language and is downloaded; otherwise none, and why.
export function pickVoice(o: {
  language: LanguageCode
  engine: VoiceEngine
  installed: Record<NaturalVoiceEngine, boolean>
  kokoroVoice: string
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
