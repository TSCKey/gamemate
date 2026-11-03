// The languages GameMate speaks. Shared by the main process and the windows.

export type LanguageCode =
  'en' | 'ar' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'tr' | 'ru' | 'ja' | 'zh' | 'ko'

export interface Language {
  code: LanguageCode
  // For the AI's instructions ("answer in German").
  englishName: string
  // How the language calls itself, shown in the language picker.
  nativeName: string
  dir: 'ltr' | 'rtl'
  // Whether GameMate's natural voice (Supertonic) speaks it; otherwise a Windows voice does.
  naturalVoice: boolean
}

export const LANGUAGES: Language[] = [
  { code: 'en', englishName: 'English', nativeName: 'English', dir: 'ltr', naturalVoice: true },
  { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', dir: 'rtl', naturalVoice: true },
  { code: 'fr', englishName: 'French', nativeName: 'Français', dir: 'ltr', naturalVoice: true },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', dir: 'ltr', naturalVoice: true },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', dir: 'ltr', naturalVoice: true },
  {
    code: 'pt',
    englishName: 'Portuguese',
    nativeName: 'Português',
    dir: 'ltr',
    naturalVoice: true
  },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano', dir: 'ltr', naturalVoice: true },
  { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', dir: 'ltr', naturalVoice: true },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский', dir: 'ltr', naturalVoice: true },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語', dir: 'ltr', naturalVoice: true },
  { code: 'zh', englishName: 'Chinese', nativeName: '中文', dir: 'ltr', naturalVoice: false },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어', dir: 'ltr', naturalVoice: true }
]

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value)
}

// The first of Windows' preferred languages that GameMate supports ("zh-Hant-TW" -> "zh"),
// otherwise English.
export function matchLanguage(tags: string[]): LanguageCode {
  for (const tag of tags) {
    const primary = tag.split(/[-_]/)[0].toLowerCase()
    if (isLanguageCode(primary)) return primary
  }
  return 'en'
}

export function languageInfo(code: LanguageCode): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
}

// The language the first-launch picker starts on: the one already chosen, else the PC's.
export function initialLanguage(language: LanguageCode | '', system: LanguageCode): LanguageCode {
  return language || system
}
