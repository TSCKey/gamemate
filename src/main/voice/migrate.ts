// Moving players' voice settings from older GameMates.
import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { VOICE_ENGINES, type VoiceEngine } from '../../shared/types'
import { languageInfo, type LanguageCode, type NaturalVoiceEngine } from '../../shared/languages'
import { SPEECH_MODELS } from './voiceModels'

// GameMate 0.1.3 downloaded Kokoro's English voices into the folder Kokoro downloads into
// today. Those files are deleted (340 MB); a complete download of today's files is kept.
// Downloads arrive in a separate folder and are moved in only once complete, so a folder
// missing any of today's files is 0.1.3's.
export async function removeOldVoice(modelsDir: string): Promise<void> {
  const { repo, files } = SPEECH_MODELS.kokoro
  const dir = join(modelsDir, repo)
  if (!existsSync(dir) || files.every((f) => existsSync(join(dir, f)))) return
  await rm(dir, { recursive: true, force: true })
}

// Voice settings saved by older GameMates: 0.3.0's Windows voices and 'natural' (Supertonic),
// or nothing at all. Those become a voice that is already downloaded and speaks the language
// (Kokoro first), so a player updating with Supertonic downloaded keeps hearing answers; with
// none downloaded, Kokoro where it speaks the language, else Supertonic, which speaks them all.
// A voice the player chose ('kokoro' or 'supertonic') stays, even in a language it can't speak:
// the Voice settings say so.
export function migrateVoiceEngine(
  saved: unknown,
  language: LanguageCode,
  installed: Record<NaturalVoiceEngine, boolean> = { kokoro: false, supertonic: false }
): VoiceEngine {
  if (saved === 'natural') return 'supertonic'
  if (VOICE_ENGINES.includes(saved as VoiceEngine)) return saved as VoiceEngine
  const { voices } = languageInfo(language)
  const ready = voices.find((voice) => installed[voice])
  if (ready) return ready
  return voices.includes('kokoro') ? 'kokoro' : 'supertonic'
}
