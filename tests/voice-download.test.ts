// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const userData = mkdtempSync(join(tmpdir(), 'gm-voice-download-'))
const fetched: string[] = []
// Every file on the server is its own name, so its size is known.
const content = (name: string): string => `contents of ${name}`

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: {},
  net: {
    fetch: async (url: string) => {
      fetched.push(url)
      if (url.includes('/api/models/')) {
        const { SPEECH_MODELS } = await import('../src/main/voice/voiceModels')
        return new Response(
          JSON.stringify(
            SPEECH_MODELS.kokoro.files.map((path) => ({ path, size: content(path).length }))
          )
        )
      }
      const name = url.split(/\/resolve\/[^/]+\//)[1]
      return new Response(content(name))
    }
  }
}))
vi.mock('../src/main/system/i18n', () => ({ t: (key: string) => key }))

const { SPEECH_MODELS, downloadSpeechModel, isSpeechModelInstalled } =
  await import('../src/main/voice/voiceModels')
const dir = join(userData, 'models', SPEECH_MODELS.kokoro.repo)

afterEach(() => rmSync(join(userData, 'models'), { recursive: true, force: true }))

describe('downloading Kokoro', () => {
  it('fetches every file, voices included', async () => {
    await downloadSpeechModel('kokoro')
    expect(isSpeechModelInstalled('kokoro')).toBe(true)
    expect(readFileSync(join(dir, 'voices/bm_george.bin'), 'utf8')).toBe(
      content('voices/bm_george.bin')
    )
  })

  it('keeps the files an earlier download already has, and fetches only the new voices', async () => {
    const kept = ['config.json', 'onnx/model.onnx', 'voices/af_heart.bin']
    for (const name of kept) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), content(name))
    }
    // A file that doesn't match what the server lists is fetched again.
    writeFileSync(join(dir, 'tokenizer.json'), 'cut off')
    fetched.length = 0
    await downloadSpeechModel('kokoro')
    expect(isSpeechModelInstalled('kokoro')).toBe(true)
    const files = fetched.filter((url) => url.includes('/resolve/'))
    expect(files).toHaveLength(SPEECH_MODELS.kokoro.files.length - kept.length)
    expect(files.some((url) => url.endsWith('/onnx/model.onnx'))).toBe(false)
    expect(files.some((url) => url.endsWith('/tokenizer.json'))).toBe(true)
    expect(readFileSync(join(dir, 'tokenizer.json'), 'utf8')).toBe(content('tokenizer.json'))
    expect(existsSync(`${dir}.partial`)).toBe(false)
  })
})
