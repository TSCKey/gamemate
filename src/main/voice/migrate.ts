// Moving players from GameMate 1.0.3's Kokoro voice to Supertonic.
import { rm } from 'fs/promises'
import { join } from 'path'
import { VOICE_ENGINES, type VoiceEngine } from '../../shared/types'

// Kokoro's download (340 MB) isn't used any more.
export async function removeOldVoice(modelsDir: string): Promise<void> {
  await rm(join(modelsDir, 'onnx-community', 'Kokoro-82M-v1.0-ONNX'), {
    recursive: true,
    force: true
  })
}

// A saved 'kokoro' becomes the natural voice when Supertonic is installed, else Windows voices.
export function migrateVoiceEngine(saved: unknown, naturalInstalled: boolean): VoiceEngine {
  if (saved === 'kokoro') return naturalInstalled ? 'natural' : 'windows'
  return VOICE_ENGINES.includes(saved as VoiceEngine) ? (saved as VoiceEngine) : 'windows'
}
