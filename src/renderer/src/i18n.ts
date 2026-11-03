// The windows' translations. Components call t() directly; the root of each window follows the
// language setting, so a language change re-renders everything below it.
import i18next from 'i18next'
import { useLayoutEffect } from 'react'
import { initReactI18next, useTranslation } from 'react-i18next'
import { I18N_OPTIONS, resources, type Translate } from '../../shared/i18n'
import { languageInfo, type LanguageCode } from '../../shared/languages'
import type { Settings } from '../../shared/types'

export function setupI18n(): void {
  if (i18next.isInitialized) return
  i18next.use(initReactI18next).init({ ...I18N_OPTIONS, resources, lng: 'en', initAsync: false })
}

export const t: Translate = (key, vars) => i18next.t(key, vars) as string

// Switches the texts and the page's language and writing direction.
export function applyLanguage(code: LanguageCode): void {
  setupI18n()
  if (i18next.language !== code) i18next.changeLanguage(code)
  const root = document.documentElement
  root.lang = code
  root.dir = languageInfo(code).dir
}

// Used by each window's root component. Until a language is chosen the windows stay English,
// except while the first-launch picker shows the language being picked.
export function useAppLanguage(settings: Pick<Settings, 'language'> | null | undefined): void {
  useTranslation()
  const language = settings?.language
  useLayoutEffect(() => {
    if (language) applyLanguage(language)
  }, [language])
}
