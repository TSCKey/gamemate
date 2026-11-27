// Moving players' voice settings from older GameMates.
import { rm } from 'fs/promises'
import { join } from 'path'
import { VOICE_ENGINES, type VoiceEngine } from '../../shared/types'
import { languageInfo, type LanguageCode } from '../../shared/languages'

// Kokoro's download (340 MB) isn't used any more.
export async function removeOldVoice(modelsDir: string): Promise<void> {
  await rm(join(modelsDir, 'onnx-community', 'Kokoro-82M-v1.0-ONNX'), {
    recursive: true,
    force: true
  })
}

// Voice settings saved by older GameMates: 0.3.0's Windows voices and 'natural' (Supertonic),
// and 0.1.3's 'kokoro'. Windows voices become Kokoro where it speaks the language, else
// Supertonic; a voice that can't speak the language becomes Supertonic, which speaks them all.
export function migrateVoiceEngine(saved: unknown, language: LanguageCode): VoiceEngine {
  const speaking = languageInfo(language).voices
  const engine = saved === 'natural' ? 'supertonic' : saved
  if (VOICE_ENGINES.includes(engine as VoiceEngine) && speaking.includes(engine as VoiceEngine)) {
    return engine as VoiceEngine
  }
  return speaking.includes('kokoro') ? 'kokoro' : 'supertonic'
}
