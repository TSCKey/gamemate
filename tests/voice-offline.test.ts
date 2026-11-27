import { describe, expect, it } from 'vitest'
import { offlineRequest } from '../src/renderer/src/voice/offline'

const KOKORO_VOICE =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/ef_dora.bin'

// What the voice workers may fetch: GameMate's own files, never the internet.
describe('the voice workers’ requests', () => {
  it('lets the bundled files through, in the installed app and under npm run dev', () => {
    const page = 'file:///C:/GameMate/resources/app.asar/out/renderer/assets/kokoro.worker-x.js'
    expect(offlineRequest('file:///C:/GameMate/resources/app.asar/out/renderer/assets/espeak-ng.wasm', page)).toBe('allow')
    expect(offlineRequest('assets/ort.wasm', page)).toBe('allow')
    const dev = 'http://localhost:5173/src/voice/kokoro.worker.ts?worker_file&type=module'
    expect(offlineRequest('http://localhost:5173/node_modules/espeak-ng/dist/espeak-ng.wasm', dev)).toBe('allow')
    expect(offlineRequest('/node_modules/onnxruntime-web/dist/ort.wasm', dev)).toBe('allow')
  }) // prettier-ignore

  it('lets the local model store through', () => {
    const page = 'file:///C:/GameMate/out/renderer/assets/kokoro.worker-x.js'
    expect(offlineRequest('gm-model://models/onnx-community/x/config.json', page)).toBe('allow')
    expect(offlineRequest('gm-model://models/x', 'http://localhost:5173/w.js')).toBe('allow')
  })

  it('refuses every other host, Hugging Face included', () => {
    for (const page of ['file:///C:/GameMate/out/renderer/w.js', 'http://localhost:5173/w.js']) {
      expect(offlineRequest(KOKORO_VOICE, page)).toBe('refuse')
      expect(offlineRequest('https://cdn.jsdelivr.net/npm/onnxruntime-web/ort.wasm', page)).toBe('refuse')
      expect(offlineRequest('http://localhost:11434/api', page)).toBe('refuse')
      expect(offlineRequest('http://localhost.evil.example:5173/x', page)).toBe('refuse')
    }
  }) // prettier-ignore
})
