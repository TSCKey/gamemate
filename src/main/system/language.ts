// Windows' display language, as the language GameMate suggests at first launch.
import { app } from 'electron'
import { matchLanguage, type LanguageCode } from '../../shared/languages'

export function systemLanguage(): LanguageCode {
  return matchLanguage(app.getPreferredSystemLanguages())
}
