import type { AnsweredBy } from '../../../preload/index.d'

// In Auto mode, a small note under an answer saying which AI answered and why.
function AnsweredByLabel({ by }: { by: AnsweredBy }): React.JSX.Element {
  return (
    <div className="answered-by" title={by.model}>
      {by.provider === 'gemini' ? '☁ Gemini' : '💻 On this PC'}
      {by.reason ? ` · ${by.reason}` : ''}
    </div>
  )
}

export default AnsweredByLabel
