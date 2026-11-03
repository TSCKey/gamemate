// The main process's texts for the player (errors, the tray menu) in the language they chose.
// Log messages and what GameMate tells the AI stay English.
import { createTranslator } from '../../shared/i18n'
import { getSettings } from './settings'

export function t(key: string, vars?: Record<string, unknown>): string {
  return createTranslator(getSettings().language || 'en')(key, vars)
}
