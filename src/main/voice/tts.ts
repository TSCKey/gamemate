// Text-to-speech with the voices installed in Windows, fully offline. Electron's speechSynthesis
// reports no voices on Windows, so a long-lived PowerShell process does the speaking. It uses
// Windows' current speech API (WinRT), which also has the voices added under Settings → Speech,
// and falls back to the older System.Speech. Commands go over stdin as JSON lines, so text is
// never part of a command line.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import type { WindowsVoice } from '../../shared/types'

const SCRIPT = `
# Replies (voice names, error messages) go back as UTF-8.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$winrt = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  $streamType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream]
  $winrt = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $player = New-Object System.Media.SoundPlayer
} catch {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SetOutputToDefaultAudioDevice()
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $cmd = $line | ConvertFrom-Json
    switch ($cmd.type) {
      'voices' {
        if ($winrt) {
          $list = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; language = $_.Language } })
        } else {
          $list = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { [pscustomobject]@{ name = $_.VoiceInfo.Name; language = $_.VoiceInfo.Culture.Name } })
        }
        [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 3 -InputObject @{ type = 'voices'; voices = $list }))
      }
      'speak' {
        if ($winrt) {
          $player.Stop()
          $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $cmd.voice } | Select-Object -First 1
          if ($voice) { $winrt.Voice = $voice }
          $winrt.Options.SpeakingRate = [double]$cmd.rate
          $winrt.Options.AudioVolume = [double]$cmd.volume
          $task = $asTask.MakeGenericMethod($streamType).Invoke($null, @($winrt.SynthesizeTextToStreamAsync([string]$cmd.text)))
          $task.Wait() | Out-Null
          $player.Stream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($task.Result)
          $player.Play()
        } else {
          $synth.SpeakAsyncCancelAll()
          if ($cmd.voice) { try { $synth.SelectVoice($cmd.voice) } catch {} }
          $synth.Volume = [int]([double]$cmd.volume * 100)
          # System.Speech rates run from -10 to 10; map 0.5x-2x onto that range.
          $synth.Rate = [int][Math]::Max(-10, [Math]::Min(10, [Math]::Round([Math]::Log([double]$cmd.rate, 2) * 10)))
          [void]$synth.SpeakAsync([string]$cmd.text)
        }
      }
      'stop' { if ($winrt) { $player.Stop() } else { $synth.SpeakAsyncCancelAll() } }
    }
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ type = 'error'; message = $_.Exception.Message }))
  }
}
`

let proc: ChildProcessWithoutNullStreams | null = null
// Callers waiting for the current process's voice list.
let voicesWaiters: ((voices: WindowsVoice[]) => void)[] = []

function engine(): ChildProcessWithoutNullStreams | null {
  if (process.platform !== 'win32') return null
  if (proc && proc.exitCode === null) return proc
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    windowsHide: true
  })
  proc = child
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const message = JSON.parse(line) as { type: string; voices?: unknown; message?: string }
      if (message.type === 'voices') {
        const voices = (Array.isArray(message.voices) ? message.voices : []).filter(
          (v): v is WindowsVoice => typeof v?.name === 'string' && typeof v?.language === 'string'
        )
        voicesWaiters.forEach((resolve) => resolve(voices))
        voicesWaiters = []
      } else if (message.type === 'error') {
        console.error('Text-to-speech error:', message.message)
      }
    } catch {
      // Ignore anything that isn't one of our JSON lines.
    }
  })
  child.on('exit', () => {
    // A process that was replaced has no one waiting any more.
    if (proc !== child) return
    voicesWaiters.forEach((resolve) => resolve([]))
    voicesWaiters = []
  })
  return child
}

// One JSON line in plain ASCII: Windows PowerShell reads stdin in the console's code page,
// which would garble accented letters, Arabic, Chinese and every other non-ASCII text.
export function encodeCommand(command: object): string {
  return JSON.stringify(command).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}

function send(command: object): boolean {
  const p = engine()
  if (!p) return false
  p.stdin.write(encodeCommand(command) + '\n')
  return true
}

// `refresh` starts a new voice process, which also sees voices added in Windows' Settings
// since GameMate started.
export function listVoices(options: { refresh?: boolean } = {}): Promise<WindowsVoice[]> {
  if (options.refresh) shutdownSpeech()
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
    volume: Math.min(1, Math.max(0, options.volume)),
    rate: Math.min(2, Math.max(0.5, options.rate))
  })
}

export function stopSpeaking(): void {
  if (proc && proc.exitCode === null) send({ type: 'stop' })
}

export function shutdownSpeech(): void {
  proc?.kill()
  proc = null
  voicesWaiters.forEach((resolve) => resolve([]))
  voicesWaiters = []
}
