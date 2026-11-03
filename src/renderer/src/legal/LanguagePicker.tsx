import { useLayoutEffect, useState } from 'react'
import { LANGUAGES, type LanguageCode } from '../../../shared/languages'
import { applyLanguage, t } from '../i18n'

// Shown once, at the first launch (also after updating from a version without languages), before
// the Terms of Use. The window switches to a language as soon as it is picked.
function LanguagePicker({
  initial,
  onChoose
}: {
  initial: LanguageCode
  onChoose: (code: LanguageCode) => void
}): React.JSX.Element {
  const [choice, setChoice] = useState(initial)
  useLayoutEffect(() => applyLanguage(choice), [choice])

  return (
    <div className="modal-backdrop">
      <div
        className="modal language-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-title"
      >
        <h2 id="language-title">{t('languagePicker.title')}</h2>
        <p className="modal-lead">{t('languagePicker.lead')}</p>
        <div className="language-list" role="radiogroup" aria-labelledby="language-title">
          {LANGUAGES.map((l) => (
            <label key={l.code} className="language-option" lang={l.code} dir={l.dir}>
              <input
                type="radio"
                name="language"
                checked={choice === l.code}
                onChange={() => setChoice(l.code)}
              />
              {l.nativeName}
            </label>
          ))}
        </div>
        <div className="button-row">
          <button type="button" className="primary" onClick={() => onChoose(choice)}>
            {t('languagePicker.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LanguagePicker
