import { spawn } from 'child_process'
import { describe, expect, it } from 'vitest'
import { encodeCommand } from '../src/main/voice/tts'

describe('commands to Windows voices', () => {
  it('reach PowerShell as plain ASCII, whatever the language', () => {
    const command = {
      type: 'speak',
      text: 'Créer un piston 中文 مكبس 😀',
      voice: 'Microsoft Huihui'
    }
    const line = encodeCommand(command)
    // PowerShell 5.1 reads stdin in the console's code page, so only ASCII arrives intact.
    expect(/^[\x20-\x7e]*$/.test(line)).toBe(true)
    expect(JSON.parse(line)).toEqual(command)
  })

  it.skipIf(process.platform !== 'win32')(
    'arrive in Windows PowerShell unchanged',
    async () => {
      const text = 'Créer 中文 مكبس 😀'
      const script =
        '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ' +
        '$c = [Console]::In.ReadLine() | ConvertFrom-Json; [Console]::Out.WriteLine($c.text)'
      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        windowsHide: true
      })
      let out = ''
      ps.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')))
      const done = new Promise((resolve) => ps.on('exit', resolve))
      ps.stdin.end(encodeCommand({ text }) + '\n')
      await done
      expect(out.trim()).toBe(text)
    },
    30_000
  )
})
