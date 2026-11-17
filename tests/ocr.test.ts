import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake PowerShell the tests control: what spawning does, and what it prints.
const fake = vi.hoisted(() => ({
  spawnImpl: null as null | (() => unknown)
}))
vi.mock('child_process', () => {
  const spawn = (): unknown => fake.spawnImpl!()
  return { spawn, default: { spawn } }
})

import { ocrCommand, parseOcrReply, type OcrLine } from '../src/main/system/ocr'

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

  it('count an error reply as no lines, and keep its message', () => {
    expect(parseOcrReply('{"id":5,"error":"no engine"}')).toEqual({
      id: 5,
      lines: [],
      error: 'no engine'
    })
  })
})

describe('reading text from an image', () => {
  interface FakeShell extends EventEmitter {
    stdout: PassThrough
    stdin: PassThrough
    exitCode: number | null
    kill: () => void
    written: { id: number }[]
  }
  const realPlatform = process.platform
  let shell: FakeShell
  let readText: (png: Buffer, language?: string) => Promise<OcrLine[]>
  let shutdownOcr: () => void
  const box: OcrLine = { text: 'Moss Grotto', x: 1, y: 2, width: 3, height: 4 }

  // Lets the fake process's output reach readText.
  const flush = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0)
    await new Promise<void>((resolve) => process.nextTick(resolve))
    await vi.advanceTimersByTimeAsync(0)
  }
  const reply = async (message: string): Promise<void> => {
    shell.stdout.write(message + '\n')
    await flush()
  }
  // Collects a read's result so tests can tell whether it has settled yet.
  const track = (p: Promise<OcrLine[]>): { settled: boolean; value?: OcrLine[] } => {
    const state: { settled: boolean; value?: OcrLine[] } = { settled: false }
    void p.then((v) => {
      state.settled = true
      state.value = v
    })
    return state
  }

  const makeShell = (): FakeShell => {
    const made: FakeShell = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stdin: new PassThrough(),
      exitCode: null as number | null,
      kill: () => {},
      written: [] as { id: number }[]
    })
    made.stdin.on('data', (d: Buffer) => {
      for (const l of d.toString().split('\n').filter(Boolean)) made.written.push(JSON.parse(l))
    })
    return made
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    // readText does nothing off Windows, so pretend to be on it: these tests must not pass trivially.
    Object.defineProperty(process, 'platform', { value: 'win32' })
    shell = makeShell()
    fake.spawnImpl = () => shell
    vi.resetModules()
    ;({ readText, shutdownOcr } = await import('../src/main/system/ocr'))
  })

  afterEach(() => {
    shutdownOcr()
    Object.defineProperty(process, 'platform', { value: realPlatform })
    vi.useRealTimers()
  })

  it('gives no lines when the helper process stops', async () => {
    const read = track(readText(Buffer.from([1])))
    shell.exitCode = 1
    shell.emit('exit', 1)
    await flush()
    expect(read.value).toEqual([])
  })

  it('gives back the lines of the reply with the same id', async () => {
    const read = track(readText(Buffer.from([1])))
    await flush()
    await reply(JSON.stringify({ id: shell.written[0].id, lines: [box] }))
    expect(read.value).toEqual([box])
  })

  it('matches replies to their requests even when they arrive out of order', async () => {
    const first = track(readText(Buffer.from([1])))
    const second = track(readText(Buffer.from([2])))
    await flush()
    const [a, b] = shell.written.map((w) => w.id)
    expect(a).not.toBe(b)
    await reply(JSON.stringify({ id: b, lines: [{ ...box, text: 'second' }] }))
    expect(first.settled).toBe(false)
    expect(second.value?.[0].text).toBe('second')
    await reply(JSON.stringify({ id: a, lines: [{ ...box, text: 'first' }] }))
    expect(first.value?.[0].text).toBe('first')
  })

  it('gives no lines for an error reply', async () => {
    const read = track(readText(Buffer.from([1])))
    await flush()
    await reply(JSON.stringify({ id: shell.written[0].id, error: 'no engine' }))
    expect(read.value).toEqual([])
  })

  it('warns once about failed reads, with the first message, per helper process', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (let i = 0; i < 2; i++) {
        const read = track(readText(Buffer.from([1])))
        await flush()
        await reply(JSON.stringify({ id: shell.written[i].id, error: `no engine ${i}` }))
        expect(read.value).toEqual([])
      }
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0].join(' ')).toContain('no engine 0')

      // A new helper process warns again, as the cause may have changed.
      shell.exitCode = 1
      shell.emit('exit', 1)
      shell = makeShell()
      const read = track(readText(Buffer.from([1])))
      await flush()
      await reply(JSON.stringify({ id: shell.written[0].id, error: 'still no engine' }))
      expect(read.value).toEqual([])
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps waiting through a garbage line, then times out with no lines', async () => {
    const read = track(readText(Buffer.from([1])))
    await flush()
    await reply('garbage')
    expect(read.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(read.value).toEqual([])
  })

  it('gives up after 3 seconds, not before', async () => {
    const read = track(readText(Buffer.from([1])))
    await vi.advanceTimersByTimeAsync(2900)
    expect(read.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(read.value).toEqual([])
  })

  it('ignores a reply that arrives after the read gave up', async () => {
    const late = track(readText(Buffer.from([1])))
    await flush()
    const lateId = shell.written[0].id
    await vi.advanceTimersByTimeAsync(3000)
    expect(late.value).toEqual([])
    // The late reply must not disturb the next read.
    const next = track(readText(Buffer.from([2])))
    await flush()
    await reply(JSON.stringify({ id: lateId, lines: [{ ...box, text: 'stale' }] }))
    expect(next.settled).toBe(false)
    await reply(JSON.stringify({ id: shell.written[1].id, lines: [box] }))
    expect(next.value).toEqual([box])
  })

  it('gives no lines when the process cannot be started', async () => {
    fake.spawnImpl = () => {
      throw new Error('spawn failed')
    }
    expect(await readText(Buffer.from([1]))).toEqual([])
  })

  it('gives no lines when writing to the process fails', async () => {
    shell.stdin.write = (): boolean => {
      throw new Error('write failed')
    }
    expect(await readText(Buffer.from([1]))).toEqual([])
  })

  it('gives no lines, once the time is up, when the pipe reports a write error', async () => {
    const read = track(readText(Buffer.from([1])))
    await flush()
    shell.stdin.emit('error', new Error('EPIPE'))
    await vi.advanceTimersByTimeAsync(3000)
    expect(read.value).toEqual([])
  })
})
