// Text-to-speech with the voices built into Windows (System.Speech), fully offline.
// Electron's speechSynthesis reports no voices on Windows, so a long-lived PowerShell process
// does the speaking. Commands go over stdin as JSON lines, so text is never part of a command line.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'

const SCRIPT = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToDefaultAudioDevice()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $cmd = $line | ConvertFrom-Json
    switch ($cmd.type) {
      'voices' {
        $names = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name })
        [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ type = 'voices'; voices = $names }))
      }
      'speak' {
        $synth.SpeakAsyncCancelAll()
        if ($cmd.voice) { try { $synth.SelectVoice($cmd.voice) } catch {} }
        $synth.Volume = [int]$cmd.volume
        $synth.Rate = [int]$cmd.rate
        [void]$synth.SpeakAsync([string]$cmd.text)
      }
      'stop' { $synth.SpeakAsyncCancelAll() }
    }
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ type = 'error'; message = $_.Exception.Message }))
  }
}
`

let proc: ChildProcessWithoutNullStreams | null = null
let voicesWaiters: ((voices: string[]) => void)[] = []

function engine(): ChildProcessWithoutNullStreams | null {
  if (process.platform !== 'win32') return null
  if (proc && proc.exitCode === null) return proc
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    windowsHide: true
  })
  createInterface({ input: proc.stdout }).on('line', (line) => {
    try {
      const message = JSON.parse(line) as { type: string; voices?: string[]; message?: string }
      if (message.type === 'voices') {
        const voices = Array.isArray(message.voices) ? message.voices : []
        voicesWaiters.forEach((resolve) => resolve(voices))
        voicesWaiters = []
      } else if (message.type === 'error') {
        console.error('Text-to-speech error:', message.message)
      }
    } catch {
      // Ignore anything that isn't one of our JSON lines.
    }
  })
  proc.on('exit', () => {
    voicesWaiters.forEach((resolve) => resolve([]))
    voicesWaiters = []
  })
  return proc
}

function send(command: object): boolean {
  const p = engine()
  if (!p) return false
  p.stdin.write(JSON.stringify(command) + '\n')
  return true
}

export function listVoices(): Promise<string[]> {
  return new Promise((resolve) => {
    voicesWaiters.push(resolve)
    if (!send({ type: 'voices' })) resolve([])
    setTimeout(() => resolve([]), 10_000)
  })
}

export interface SpeakOptions {
  voice: string
  // 0-1
  volume: number
  // 0.5-2, 1 = normal speed
  rate: number
}

export function speak(text: string, options: SpeakOptions): void {
  const clean = text.trim().slice(0, 2000)
  if (!clean) return
  send({
    type: 'speak',
    text: clean,
    voice: options.voice,
    volume: Math.round(Math.min(1, Math.max(0, options.volume)) * 100),
    // System.Speech rates run from -10 to 10; map 0.5x-2x onto that range.
    rate: Math.round(Math.max(-10, Math.min(10, Math.log2(options.rate) * 10)))
  })
}

export function stopSpeaking(): void {
  if (proc && proc.exitCode === null) send({ type: 'stop' })
}

export function shutdownSpeech(): void {
  proc?.kill()
  proc = null
}
