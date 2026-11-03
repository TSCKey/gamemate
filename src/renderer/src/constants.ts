// Values shared by several screens.
import type { CommentaryFrequency, CompanionMode, CompanionState } from '../../preload/index.d'

import { t } from './i18n'

export { TERMS_VERSION } from '../../shared/types'

export const LINKS = {
  geminiTerms: 'https://ai.google.dev/gemini-api/terms',
  googlePrivacy: 'https://policies.google.com/privacy',
  geminiKey: 'https://aistudio.google.com/apikey',
  wikiDisclaimer: 'https://minecraft.wiki/w/Minecraft_Wiki:General_disclaimer'
}

// Labels are read when shown, so they follow the language setting.
export const COMPANION_MODES: { value: CompanionMode; label: string; help: string }[] = (
  ['disabled', 'on-demand', 'observation', 'commentary', 'quiet'] as const
).map((value) => ({
  value,
  get label(): string {
    return t(`companion.modes.${value}.label`)
  },
  get help(): string {
    return t(`companion.modes.${value}.help`)
  }
}))

export const COMMENTARY_FREQUENCIES: { value: CommentaryFrequency; label: string }[] = (
  ['rare', 'normal', 'frequent'] as const
).map((value) => ({
  value,
  get label(): string {
    return t(`companion.frequencies.${value}`)
  }
}))

export const statusText = (status: CompanionState['status']): string =>
  t(`companion.status.${status}`)
