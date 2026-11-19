// The fine-tuned comment writer was trained on GameMate's own prompts turned into a short system
// turn (who it is, how long, what tone) and the moment as the user turn. It has to be called in
// exactly that format, so the training script and GameMate both use this file's rules. A change
// to reactionPrompt's wording that this file reads means the model needs retraining.

export interface CommentaryMessages {
  system: string
  user: string
  // A second try after a line that was too close to a recent one.
  retry: boolean
}

// What reactionPrompt appends when the first line came out too close to a recent comment.
const RETRY_NOTE = 'word it differently'

export function commentaryMessages(prompt: string): CommentaryMessages {
  const [head, rest = ''] = prompt.split('\nHow to react:')
  const game = /play (.+?) with them/.exec(head)?.[1] ?? 'a game'
  const words = /at most (\d+) words/.exec(rest)?.[1] ?? '14'
  const tone = rest.includes('calm and understated')
    ? 'calm, no exclamation marks'
    : rest.includes('openly excited')
      ? 'excited'
      : 'natural'
  const humor =
    rest.includes('No jokes here') || rest.includes('Do not joke')
      ? 'no jokes'
      : rest.includes('Be playful')
        ? 'playful'
        : 'a light touch of humor if it fits'
  return {
    system: `You are GameMate, a friend watching someone play ${game}. Say one line to the player about this moment, at most ${words} words. Tone: ${tone}; ${humor}. Name the boss or place when one is listed. Only state what is listed; never invent. Start differently from your last comments.`,
    // The moment, what GameMate remembers and its last comments, without the opening persona.
    user: head.split('\n').slice(2).join('\n').trim(),
    retry: rest.includes(RETRY_NOTE)
  }
}

// Liquid AI's suggested sampling, warmer and with a presence penalty so lines vary: with it the
// fine-tuned model spoke 36 of 38 moments of a real session (GameMate's usual sampling: 31).
export const COMMENTARY_SAMPLING = {
  temperature: 0.4,
  top_k: 50,
  top_p: 1,
  min_p: 0,
  repeat_penalty: 1.05,
  presence_penalty: 0.6
}
// The second try is warmer still, so it doesn't come out the same.
export const COMMENTARY_RETRY_SAMPLING = { ...COMMENTARY_SAMPLING, temperature: 0.8 }
// The longest comment is 24 words.
export const COMMENTARY_MAX_TOKENS = 80
