// What the voice settings say about the chosen voice and the player's language.
import { languageInfo, type LanguageCode, type NaturalVoiceEngine } from '../../../shared/languages'
import { kokoroVoicesFor, pickVoice } from '../../../shared/voices'

// Product names: the same in every language.
export const VOICE_NAMES: Record<NaturalVoiceEngine, string> = {
  kokoro: 'Kokoro',
  supertonic: 'Supertonic'
}

export type VoiceHint =
  | { kind: 'ready' }
  // The chosen voice doesn't speak the language; `other` does (null if no voice does).
  | { kind: 'cantSpeak'; other: NaturalVoiceEngine | null }
  | { kind: 'notDownloaded' }

// The voice that speaks the language when the chosen one doesn't, or null when it does.
export function cantSpeakHint(
  language: LanguageCode,
  engine: NaturalVoiceEngine
): { other: NaturalVoiceEngine | null } | null {
  const { voices } = languageInfo(language)
  if (voices.includes(engine)) return null
  return { other: voices.find((v) => v !== engine) ?? null }
}

// Why nothing would be read aloud with these settings, from pickVoice's reason.
export function voiceHint(o: Parameters<typeof pickVoice>[0]): VoiceHint {
  const choice = pickVoice(o)
  if (choice.kind !== 'none') return { kind: 'ready' }
  if (choice.reason === 'notDownloaded') return { kind: 'notDownloaded' }
  return { kind: 'cantSpeak', other: cantSpeakHint(o.language, o.engine)?.other ?? null }
}

// Kokoro speaks the language with only one voice (French).
export function kokoroHasOneVoice(language: LanguageCode): boolean {
  return kokoroVoicesFor(language).length === 1
}
