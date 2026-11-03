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
}

export const LANGUAGES: Language[] = [
  { code: 'en', englishName: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'fr', englishName: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'de', englishName: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'es', englishName: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'pt', englishName: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'it', englishName: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'ru', englishName: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'ja', englishName: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'zh', englishName: 'Chinese', nativeName: '中文', dir: 'ltr' },
  { code: 'ko', englishName: 'Korean', nativeName: '한국어', dir: 'ltr' }
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
