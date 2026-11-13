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
const { engineArgs, chooseDevices, visionPlace } = await import('../src/main/ai/llamaEngine')

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

  it('keeps the conversation in less graphics memory', () => {
    // Measured on a laptop RTX 4050 with Qwen3.5 4B: about 180 MB less, same speed and answers.
    const args = engineArgs(files, 1234, 'key', 'Vulkan1').join(' ')
    expect(args).toContain('-fa on -ctk q8_0 -ctv q8_0')
  })

  it('reads screenshots on the graphics card unless the player wants its memory free', () => {
    const usual = engineArgs(files, 1234, 'key', 'Vulkan1').join(' ')
    expect(usual).not.toContain('-mmdev')
    expect(usual).not.toContain('--no-mmproj-offload')
    // The second graphics chip reads them instead (about 870 MB less on the card).
    const spare = engineArgs(files, 1234, 'key', 'Vulkan1', { device: 'Vulkan0' }).join(' ')
    expect(spare).toContain('-mmdev Vulkan0')
    // Without one, the processor does.
    const processor = engineArgs(files, 1234, 'key', 'Vulkan1', 'processor')
    expect(processor).toContain('--no-mmproj-offload')
    expect(processor).not.toContain('-mmdev')
  })

  it('runs the model on the dedicated card and keeps the integrated chip as a spare', () => {
    const laptop = `Available devices:
  Vulkan0: AMD Radeon(TM) Graphics (8034 MiB, 7632 MiB free)
  Vulkan1: NVIDIA GeForce RTX 4050 Laptop GPU (5920 MiB, 5152 MiB free)`
    expect(chooseDevices(laptop)).toEqual({ main: 'Vulkan1', spare: 'Vulkan0' })
    // With one device, llama.cpp's own choice is right and there is no spare.
    const desktop = `Available devices:
  Vulkan0: NVIDIA GeForce RTX 4070 (12282 MiB, 11000 MiB free)`
    expect(chooseDevices(desktop)).toEqual({ main: null, spare: null })
    // Two dedicated cards: the one with more free memory runs the model, nothing is spare.
    const two = `  Vulkan0: NVIDIA GeForce RTX 3060 (12000 MiB, 4000 MiB free)
  Vulkan1: NVIDIA GeForce RTX 4070 (12282 MiB, 11000 MiB free)`
    expect(chooseDevices(two)).toEqual({ main: 'Vulkan1', spare: null })
  })

  it('moves screenshot reading off the card only when the player asked for it', () => {
    const laptop = { main: 'Vulkan1', spare: 'Vulkan0' }
    expect(visionPlace(false, laptop)).toBe('card')
    expect(visionPlace(true, laptop)).toEqual({ device: 'Vulkan0' })
    expect(visionPlace(true, { main: null, spare: null })).toBe('processor')
  })
})
