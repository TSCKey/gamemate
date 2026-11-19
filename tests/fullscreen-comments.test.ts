// The comment pop-up and fullscreen games: with "Hide text in fullscreen" on, a comment over a game
// that fills its display is only spoken.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  settings: { showComments: true, speakComments: true, hideCommentsInFullscreen: true },
  fills: true
}
const shown: string[] = []
const sent: string[] = []

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = {
      send: (channel: string, text: string) => sent.push(`${channel}:${text}`)
    }
    setAlwaysOnTop(): void {
      // Not needed here.
    }
    setContentProtection(): void {
      // Not needed here.
    }
    on(): void {
      // Not needed here.
    }
    isDestroyed(): boolean {
      return false
    }
    isVisible(): boolean {
      return false
    }
    setPosition(): void {
      // Not needed here.
    }
    showInactive(): void {
      shown.push('shown')
    }
    hide(): void {
      // Not needed here.
    }
    destroy(): void {
      // Not needed here.
    }
  }
  const display = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
  return {
    app: { once: () => {} },
    BrowserWindow,
    screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display }
  }
})
vi.mock('../src/main/system/settings', () => ({ getSettings: () => state.settings }))
vi.mock('../src/main/windows/fullscreen', () => ({ foregroundFillsDisplay: () => state.fills }))

const toast = await import('../src/main/windows/toast')
const { coversDisplay } = await vi.importActual<typeof import('../src/main/windows/fullscreen')>(
  '../src/main/windows/fullscreen'
)

describe('the comment pop-up over a fullscreen game', () => {
  beforeEach(() => {
    shown.length = 0
    sent.length = 0
    toast.closeToast()
    toast.setUpToast(() => {}, '')
  })

  const comment = (text: string): void => {
    toast.showToast(text, 1)
    toast.toastReady()
  }

  it('stays off the game, while the comment is still passed on to be read aloud', () => {
    comment('Nice one')
    expect(shown).toEqual([])
    expect(sent).toEqual(['toast:show:Nice one'])
  })

  it('shows as usual over a game in a window', () => {
    state.fills = false
    comment('Nice one')
    expect(shown).toEqual(['shown'])
    state.fills = true
  })

  it('shows when the player hasn’t asked to hide it, or when comments aren’t spoken', () => {
    state.settings = { ...state.settings, hideCommentsInFullscreen: false }
    comment('One')
    state.settings = { ...state.settings, hideCommentsInFullscreen: true, speakComments: false }
    comment('Two')
    expect(shown).toEqual(['shown', 'shown'])
    state.settings = { ...state.settings, speakComments: true }
  })
})

describe('telling a fullscreen window', () => {
  const display = { left: 0, top: 0, right: 1920, bottom: 1080 }

  it('counts a window covering the display, borderless or exclusive', () => {
    expect(coversDisplay({ left: 0, top: 0, right: 1920, bottom: 1080 }, display)).toBe(true)
    expect(coversDisplay({ left: -1, top: 0, right: 1921, bottom: 1081 }, display)).toBe(true)
  })

  it('does not count a maximised window, which leaves the taskbar, or a smaller one', () => {
    expect(coversDisplay({ left: -8, top: -8, right: 1928, bottom: 1040 }, display)).toBe(false)
    expect(coversDisplay({ left: 100, top: 100, right: 1380, bottom: 820 }, display)).toBe(false)
  })

  it('works on a second display to the left', () => {
    const left = { left: -1920, top: 283, right: 0, bottom: 1363 }
    expect(coversDisplay({ left: -1920, top: 283, right: 0, bottom: 1363 }, left)).toBe(true)
  })
})
