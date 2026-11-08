// Values shared by several screens.
import type {
  CommentaryCategory,
  CommentaryFrequency,
  CommentaryHumor,
  CompanionMode,
  CompanionState,
  ReactionIntensity
} from '../../preload/index.d'

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

export const REACTION_INTENSITIES: { value: ReactionIntensity; label: string }[] = (
  ['subtle', 'normal', 'expressive'] as const
).map((value) => ({
  value,
  get label(): string {
    return t(`companion.intensities.${value}`)
  }
}))

export const COMMENTARY_HUMOR_LEVELS: { value: CommentaryHumor; label: string }[] = (
  ['none', 'light', 'playful'] as const
).map((value) => ({
  value,
  get label(): string {
    return t(`companion.humorLevels.${value}`)
  }
}))

export const COMMENTARY_CATEGORIES: { value: CommentaryCategory; label: string }[] = (
  ['combat', 'skill', 'teamwork', 'objectives', 'match', 'world'] as const
).map((value) => ({
  value,
  get label(): string {
    return t(`companion.categories.${value}`)
  }
}))

// How comments reach the player, made from the two settings behind it.
export type CommentDelivery = 'text' | 'voice' | 'both'

export const COMMENT_DELIVERIES: { value: CommentDelivery; label: string }[] = (
  ['text', 'voice', 'both'] as const
).map((value) => ({
  value,
  get label(): string {
    return t(`companion.delivery.${value}`)
  }
}))

export const statusText = (status: CompanionState['status']): string =>
  t(`companion.status.${status}`)
