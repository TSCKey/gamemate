// Reading aloud: the main process picks the voice for GameMate's language (shared/voices.ts) and
// the pop-up window speaks it. Nothing is said when no downloaded voice speaks the language.

export function speak(text: string): void {
  window.api.voice.speak(text)
}

// The same from a window that can tell the player why nothing is heard: true the first time no
// voice is downloaded (once, until a voice speaks again).
export async function speakOrNotice(text: string): Promise<boolean> {
  return (await window.api.voice.speak(text, { notice: true })) === 'noVoice'
}

export function stopSpeaking(): void {
  window.api.voice.stop()
}
