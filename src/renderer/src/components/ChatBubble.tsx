import type { ChatMessage as Message } from '../../../preload/index.d'
import AnsweredByLabel from './AnsweredByLabel'
import Pictures from './Pictures'
import RecipeCard from './RecipeCard'
import SearchSuggestions from './SearchSuggestions'
import Sources from './Sources'
import { t } from '../i18n'

// One chat bubble. The text sets its own direction, so an Arabic answer reads right to left in an
// English window and the other way round.
function ChatBubble({ message, onAuto }: { message: Message; onAuto: boolean }): React.JSX.Element {
  return (
    <div className={`bubble bubble-${message.role}`}>
      {message.images?.map((img, j) => (
        <img
          key={j}
          className="bubble-screenshot"
          src={`data:image/jpeg;base64,${img}`}
          alt={t('app.screenshotSentWithThisQuestion')}
        />
      ))}
      <div dir="auto">{message.content}</div>
      {message.recipes?.map((r, j) => (
        <RecipeCard key={j} recipe={r} />
      ))}
      <Pictures pictures={message.pictures} />
      <Sources sources={message.sources} />
      <SearchSuggestions html={message.searchSuggestions} />
      {onAuto && message.answeredBy && <AnsweredByLabel by={message.answeredBy} />}
    </div>
  )
}

export default ChatBubble
