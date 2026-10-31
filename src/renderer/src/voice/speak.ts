// Text-to-speech runs in the main process with the voices built into Windows
// (Electron's speechSynthesis has no voices on Windows).

export function speak(text: string): void {
  window.api.voice.speak(text)
}

export function stopSpeaking(): void {
  window.api.voice.stop()
}
