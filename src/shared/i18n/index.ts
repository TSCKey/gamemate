// GameMate's texts in every language, used by the windows and the main process. English is the
// source; a text missing from a language falls back to English.
import i18next, { type i18n } from 'i18next'
import type { LanguageCode } from '../languages'
import ar from './ar.json'
import de from './de.json'
import en from './en.json'
import es from './es.json'
import fr from './fr.json'
import it from './it.json'
import ja from './ja.json'
import ko from './ko.json'
import pt from './pt.json'
import ru from './ru.json'
import tr from './tr.json'
import zh from './zh.json'

export type Resources = Partial<Record<LanguageCode, { translation: object }>>

export const resources: Record<LanguageCode, { translation: object }> = {
  en: { translation: en },
  ar: { translation: ar },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  pt: { translation: pt },
  it: { translation: it },
  tr: { translation: tr },
  ru: { translation: ru },
  ja: { translation: ja },
  zh: { translation: zh },
  ko: { translation: ko }
}

export type Translate = (key: string, vars?: Record<string, unknown>) => string

// The i18next settings both sides use.
export const I18N_OPTIONS = {
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false
} as const

const translators = new Map<string, i18n>()

// A translator for one language (kept, so each language is set up once). Tests may pass their
// own texts.
export function createTranslator(lang: LanguageCode, texts: Resources = resources): Translate {
  const key = texts === resources ? lang : ''
  let instance = key ? translators.get(key) : undefined
  if (!instance) {
    instance = i18next.createInstance()
    instance.init({ ...I18N_OPTIONS, resources: texts, lng: lang, initAsync: false })
    if (key) translators.set(key, instance)
  }
  const ready = instance
  return (k, vars) => ready.t(k, vars) as string
}

// Every key in a translation file, as "chat.input.placeholder".
export function flattenKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flattenKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  )
}
