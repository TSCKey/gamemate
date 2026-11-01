// Values shared by several screens.
import type { CommentaryFrequency, CompanionMode, CompanionState } from '../../preload/index.d'

// Bump when the privacy notice changes in a way players should see again (matches main/settings.ts).
export const PRIVACY_NOTICE_VERSION = 1

export const LINKS = {
  geminiTerms: 'https://ai.google.dev/gemini-api/terms',
  googlePrivacy: 'https://policies.google.com/privacy',
  geminiKey: 'https://aistudio.google.com/apikey',
  wikiDisclaimer: 'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer'
}

export const COMPANION_MODES: { value: CompanionMode; label: string; help: string }[] = [
  {
    value: 'disabled',
    label: 'Disabled',
    help: 'Never looks at your screen, not even when you press the shortcut.'
  },
  { value: 'on-demand', label: 'On-demand', help: 'Only looks and answers when you ask.' },
  {
    value: 'observation',
    label: 'Observation',
    help: 'Watches your game and keeps a log of what happens, without pop-ups.'
  },
  {
    value: 'commentary',
    label: 'Commentary',
    help: 'Watches your game and pops up a short comment when something important happens.'
  },
  {
    value: 'quiet',
    label: 'Quiet',
    help: 'Watches silently and uses what it saw only to answer your questions.'
  }
]

export const COMMENTARY_FREQUENCIES: { value: CommentaryFrequency; label: string }[] = [
  { value: 'rare', label: 'Rarely (big moments only)' },
  { value: 'normal', label: 'Sometimes' },
  { value: 'frequent', label: 'Often' }
]

export const STATUS_TEXT: Record<CompanionState['status'], string> = {
  off: 'Not watching',
  paused: 'Paused',
  'no-model': 'Pick a model to start watching',
  'waiting-for-game': 'Waiting for a game to be the active window',
  watching: 'Watching',
  analyzing: 'Looking at your screen…'
}
