import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))
vi.mock('koffi', () => ({ default: {} }))

// Loaded the way GameMate loads them: settings first.
await import('../src/main/system/settings')
const { engineArgs } = await import('../src/main/ai/llamaEngine')

const files = { model: 'model.gguf', mmproj: 'mmproj.gguf' }

describe('starting the built-in AI', () => {
  it('lets the model think only briefly before it answers', () => {
    // At about 43 tokens a second on a laptop RTX 4050, 512 tokens of thinking were 12 s of
    // waiting before the first word; 256 keeps that around 6 s.
    const args = engineArgs(files, 1234, 'key', 'Vulkan1')
    expect(args[args.indexOf('--reasoning-budget') + 1]).toBe('256')
  })

  it('runs on the chosen graphics card, and only for GameMate', () => {
    const args = engineArgs(files, 1234, 'key', 'Vulkan1')
    expect(args.join(' ')).toContain('-dev Vulkan1')
    expect(args.join(' ')).toContain('--host 127.0.0.1 --port 1234 --api-key key')
    expect(engineArgs(files, 1234, 'key', null)).not.toContain('-dev')
  })
})
