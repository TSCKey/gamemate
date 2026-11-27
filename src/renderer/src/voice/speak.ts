// Reading aloud: the main process picks the voice for GameMate's language (shared/voices.ts) and
// the pop-up window speaks it. Nothing is said when no downloaded voice speaks the language.

export function speak(text: string): void {
  window.api.voice.speak(text)
}

export function stopSpeaking(): void {
  window.api.voice.stop()
}
