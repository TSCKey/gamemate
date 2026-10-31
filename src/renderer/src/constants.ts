// Values shared by several screens.
import type { CompanionState } from '../../preload/index.d'

// Bump when the privacy notice changes in a way players should see again (matches main/settings.ts).
export const PRIVACY_NOTICE_VERSION = 1

export const LINKS = {
  geminiTerms: 'https://ai.google.dev/gemini-api/terms',
  googlePrivacy: 'https://policies.google.com/privacy',
  geminiKey: 'https://aistudio.google.com/apikey',
  wikiDisclaimer: 'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer'
}

export const STATUS_TEXT: Record<CompanionState['status'], string> = {
  off: 'Not watching',
  paused: 'Paused',
  'no-model': 'Pick a model to start watching',
  'waiting-for-game': 'Waiting for Minecraft to be the active window',
  watching: 'Watching',
  analyzing: 'Looking at your screen…'
}
