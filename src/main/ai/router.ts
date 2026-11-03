// Auto mode's rules for which AI should answer a question. Kept free of Electron and I/O so
// the rules are easy to test and tune.

// Questions that need reasoning, planning or broad knowledge rather than a quick fact.
const COMPLEX =
  /\b(why|explain|how does|how do .* work|what happens|best|better|strateg\w*|should i|plan|design|compare|difference|vs|farm\w*|redstone|automat\w*|efficient|tips?|guide|step[- ]by[- ]step|ideas?|survive|speedrun|beat|defeat|kill the|ender dragon|wither|build\w*|portal|structure|where (?:do|can) i find|where to find)\b/i
const RECIPE_INTENT = /\b(craft\w*|recipes?|make|made of|ingredients?|need for)\b/i
const LONG_QUESTION_WORDS = 25
const LONG_CONVERSATION_MESSAGES = 6

export interface QuestionInfo {
  question: string
  hasImages: boolean
  // Messages in the conversation so far, including this question.
  messages: number
  // Whether the question names an item GameMate has recipe data for.
  mentionsItem: boolean
}

export interface Decision {
  cloud: boolean
  // Why, shown to the player as answers.reason.<name> in their language.
  reason: 'screenshot' | 'recipe' | 'complex' | 'longQuestion' | 'longConversation' | 'quick'
}

// The local model handles quick facts and recipes (fast, free, private); Gemini takes
// screenshots and questions that need more thinking.
export function decide(info: QuestionInfo): Decision {
  const { question } = info
  if (info.hasImages) return { cloud: true, reason: 'screenshot' }
  const complex = COMPLEX.test(question)
  if (RECIPE_INTENT.test(question) && !complex && info.mentionsItem) {
    return { cloud: false, reason: 'recipe' }
  }
  if (complex) return { cloud: true, reason: 'complex' }
  if (question.trim().split(/\s+/).length > LONG_QUESTION_WORDS) {
    return { cloud: true, reason: 'longQuestion' }
  }
  if (info.messages > LONG_CONVERSATION_MESSAGES) {
    return { cloud: true, reason: 'longConversation' }
  }
  return { cloud: false, reason: 'quick' }
}
