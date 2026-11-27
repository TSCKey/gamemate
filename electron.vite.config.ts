import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // kokoro-js pronounces English with the phonemizer package, which carries its own eSpeak
        // NG build; GameMate's own build stands in for it (see englishPhonemes.ts).
        phonemizer: resolve('src/renderer/src/voice/englishPhonemes.ts')
      }
    },
    plugins: [react()]
  }
})
