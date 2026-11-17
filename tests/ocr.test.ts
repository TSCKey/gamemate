import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { describe, expect, it, vi } from 'vitest'

// A fake PowerShell that exits straight away, as if it could not start.
vi.mock('child_process', () => {
  const spawn = (): unknown => {
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>
    child.stdout = new PassThrough()
    child.stdin = new PassThrough()
    child.exitCode = null
    child.kill = (): void => {}
    setTimeout(() => {
      child.exitCode = 1
      child.emit('exit', 1)
    }, 5)
    return child
  }
  return { spawn, default: { spawn } }
})

import { ocrCommand, parseOcrReply, readText } from '../src/main/system/ocr'

describe('commands to the Windows text reader', () => {
  it('reach PowerShell as plain ASCII and keep the id, language and image', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128])
    const line = ocrCommand(7, png, 'zh-Hans-CN é')
    expect(/^[\x20-\x7e]+$/.test(line)).toBe(true)
    const parsed = JSON.parse(line)
    expect(parsed.id).toBe(7)
    expect(parsed.language).toBe('zh-Hans-CN é')
    expect(Buffer.from(parsed.png, 'base64').equals(png)).toBe(true)
  })
})

describe('replies from the Windows text reader', () => {
  it('give back the lines with their boxes', () => {
    const reply = parseOcrReply(
      '{"id":4,"lines":[{"text":"Moss Grotto","x":1,"y":2,"width":3,"height":4}]}'
    )
    expect(reply).toEqual({
      id: 4,
      lines: [{ text: 'Moss Grotto', x: 1, y: 2, width: 3, height: 4 }]
    })
  })

  it('ignore a line that is not JSON', () => {
    expect(parseOcrReply('garbage')).toBeNull()
  })

  it('count an error reply as no lines', () => {
    expect(parseOcrReply('{"id":5,"error":"no engine"}')).toEqual({ id: 5, lines: [] })
  })
})

describe('reading text from an image', () => {
  it('gives no lines when the helper process stops', async () => {
    expect(await readText(Buffer.from([1, 2, 3]))).toEqual([])
  })
})
