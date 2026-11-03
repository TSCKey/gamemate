import type { AnsweredBy } from '../../../preload/index.d'
import { t } from '../i18n'

// In Auto mode, a small note under an answer saying which AI answered and why.
function AnsweredByLabel({ by }: { by: AnsweredBy }): React.JSX.Element {
  return (
    <div className="answered-by" title={by.model}>
      {by.provider === 'gemini' ? '☁ Gemini' : t('answeredByLabel.onThisPc')}
      {by.reason ? ` · ${by.reason}` : ''}
    </div>
  )
}

export default AnsweredByLabel
