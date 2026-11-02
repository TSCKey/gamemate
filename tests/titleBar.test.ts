import { describe, expect, it, vi } from 'vitest'

vi.mock('koffi', () => ({ default: {} }))
vi.mock('electron', () => ({ nativeTheme: {} }))

const { colorRef } = await import('../src/main/windows/titleBar')

describe('colorRef', () => {
  it('turns a CSS color into the 0x00BBGGRR form Windows expects', () => {
    expect(colorRef('#1b1d22')).toBe(0x00221d1b)
    expect(colorRef('#ff0000')).toBe(0x000000ff)
  })
})
