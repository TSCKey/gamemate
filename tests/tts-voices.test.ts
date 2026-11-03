import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterAll, describe, expect, it, vi } from 'vitest'

// A stand-in PowerShell: answers "voices" with the voices installed when it started.
const installed = vi.hoisted(() => ({ voices: [] as { name: string; language: string }[] }))
const spawned = vi.hoisted(() => [] as { killed: boolean }[])
vi.mock('child_process', () => ({
  spawn: () => {
    const voices = [...installed.voices]
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      killed: false,
      stdout: new PassThrough(),
      stdin: {
        write: (line: string) => {
          if (JSON.parse(line).type === 'voices') {
            child.stdout.write(JSON.stringify({ type: 'voices', voices }) + '\n')
          }
          return true
        }
      },
      kill: () => {
        child.killed = true
        child.exitCode = 1
        // Like a real process, the exit is reported a little later.
        setTimeout(() => child.emit('exit', 1), 5)
        return true
      }
    })
    spawned.push(child)
    return child
  }
}))

const platform = process.platform
Object.defineProperty(process, 'platform', { value: 'win32' })
afterAll(() => Object.defineProperty(process, 'platform', { value: platform }))

const { listVoices } = await import('../src/main/voice/tts')

describe('the list of Windows voices', () => {
  it('includes a voice added in Windows after GameMate started, when refreshed', async () => {
    installed.voices = [{ name: 'Microsoft Zira', language: 'en-US' }]
    expect((await listVoices()).map((v) => v.name)).toEqual(['Microsoft Zira'])

    installed.voices.push({ name: 'Microsoft Hortense', language: 'fr-FR' })
    const fresh = await listVoices({ refresh: true })
    expect(fresh.map((v) => v.name)).toEqual(['Microsoft Zira', 'Microsoft Hortense'])
    expect(spawned).toHaveLength(2)
    expect(spawned[0].killed).toBe(true)

    // The old process's exit doesn't empty later answers.
    await new Promise((r) => setTimeout(r, 20))
    expect((await listVoices()).map((v) => v.name)).toEqual([
      'Microsoft Zira',
      'Microsoft Hortense'
    ])
  })
})
