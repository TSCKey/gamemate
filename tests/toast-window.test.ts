import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for Electron's window: records what GameMate does with it.
class FakeWindow {
  static all: FakeWindow[] = []
  sent: unknown[][] = []
  visible = false
  destroyed = false
  webContents = { send: (...args: unknown[]) => this.sent.push(args) }
  constructor() {
    FakeWindow.all.push(this)
  }
  setAlwaysOnTop = vi.fn()
  setContentProtection = vi.fn()
  on = vi.fn()
  setPosition = vi.fn()
  setSize = vi.fn()
  showInactive(): void {
    this.visible = true
  }
  hide(): void {
    this.visible = false
  }
  isVisible(): boolean {
    return this.visible
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  destroy(): void {
    this.destroyed = true
  }
}

vi.mock('electron', () => ({
  app: { once: () => {} },
  BrowserWindow: FakeWindow,
  screen: {
    getAllDisplays: () => [],
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  }
}))

const toast = await import('../src/main/windows/toast')
const say = { text: 'Hi', voice: 'F1' as const, speed: 1, volume: 1, language: 'en' as const }
const open = (): FakeWindow[] => FakeWindow.all.filter((w) => !w.destroyed)

describe('the comment pop-up window', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWindow.all = []
    toast.setUpToast(() => {}, 'preload.js')
  })
  afterEach(() => {
    toast.closeToast()
    vi.useRealTimers()
  })

  it('does not exist until there is a comment to show or a sentence to say', () => {
    expect(open()).toHaveLength(0)
    toast.hushToast()
    toast.hideToast()
    expect(open()).toHaveLength(0)
    toast.showToast('Nice find!', 1)
    expect(open()).toHaveLength(1)
  })

  it('holds comments and sentences until its page is ready for them', () => {
    toast.showToast('Nice find!', 1)
    expect(toast.sayInToast(say)).toBe(true)
    const [win] = open()
    expect(win.sent).toEqual([])
    expect(win.visible).toBe(false)
    toast.toastReady()
    expect(win.sent).toEqual([
      ['toast:show', 'Nice find!'],
      ['voice:say', say]
    ])
    expect(win.visible).toBe(true)
    // Later ones go straight through.
    toast.showToast('Watch out', 1)
    expect(win.sent).toHaveLength(3)
  })

  it('drops a sentence that was hushed before the page was ready', () => {
    toast.sayInToast(say)
    toast.hushToast()
    toast.toastReady()
    expect(open()[0].sent).toEqual([])
  })

  it('closes after a few quiet minutes, and opens again for the next comment', () => {
    toast.showToast('Nice find!', 1)
    toast.toastReady()
    vi.advanceTimersByTime(6 * 60_000)
    expect(open()).toHaveLength(0)
    toast.showToast('Watch out', 1)
    expect(open()).toHaveLength(1)
  })

  it('stays open while the natural voice is still speaking', () => {
    toast.sayInToast(say)
    toast.toastReady()
    vi.advanceTimersByTime(6 * 60_000)
    expect(open()).toHaveLength(1)
    toast.toastDoneSpeaking()
    vi.advanceTimersByTime(6 * 60_000)
    expect(open()).toHaveLength(0)
  })
})
