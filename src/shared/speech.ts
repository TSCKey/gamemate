// Speech recognition in the player's language. Shared by the main process and the windows.
import type { LanguageCode } from './languages'
import type { SpeechModelStatus } from './types'

// Multilingual Whisper is told the language so it doesn't guess; English-only models
// (GameMate 1.0.3's downloads, repos ending ".en") refuse a language option.
export function whisperOptions(
  repo: string,
  language: LanguageCode
): { language?: LanguageCode; task?: 'transcribe' } {
  return repo.endsWith('.en') ? {} : { language, task: 'transcribe' }
}

// Whether voice input can work: a model is on disk and understands the language.
export function canListen(model: SpeechModelStatus | undefined, language: LanguageCode): boolean {
  if (!model?.repo) return false
  return model.installed || (model.englishOnly && language === 'en')
}

// Why voice input can't listen, so the windows can say so instead of staying silent.
export function listenProblem(
  model: SpeechModelStatus | undefined,
  language: LanguageCode
): 'englishOnly' | 'notDownloaded' | null {
  if (canListen(model, language)) return null
  return model?.englishOnly ? 'englishOnly' : 'notDownloaded'
}
