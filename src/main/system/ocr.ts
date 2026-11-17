// Reads text off small images with the text recognition built into Windows, fully offline. Like
// the voices in voice/tts.ts, a long-lived PowerShell process does the work through Windows'
// current API (WinRT), so each read costs milliseconds instead of starting PowerShell again.
// Commands go over stdin as JSON lines; replies come back on stdout.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import { idleTimer } from '../../shared/idle'

// The process is closed after this long without a read; the next read starts it again.
const IDLE_MS = 5 * 60_000
// A read that takes longer than this is given up: the game moment it was for has passed.
const READ_TIMEOUT_MS = 3000

export interface OcrLine {
  text: string
  // Pixels of the image that was read.
  x: number
  y: number
  width: number
  height: number
}

const SCRIPT = `
# Replies (recognised text, error messages) go back as UTF-8.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Wait-Op($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}
# Engines are kept per language: creating one is the slow part.
$engines = @{}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $id = 0
  try {
    $cmd = $line | ConvertFrom-Json
    $id = [int]$cmd.id
    $bytes = [Convert]::FromBase64String([string]$cmd.png)
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $writer = New-Object Windows.Storage.Streams.DataWriter $stream
    $writer.WriteBytes($bytes)
    $null = Wait-Op $writer.StoreAsync() ([uint32])
    $stream.Seek(0)
    $decoder = Wait-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Wait-Op $decoder.GetSoftwareBitmapAsync() ([Windows.Graphics.Imaging.SoftwareBitmap])
    $lang = [string]$cmd.language
    if (-not $engines.ContainsKey($lang)) {
      $engine = $null
      try { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($lang)) } catch {}
      if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
      $engines[$lang] = $engine
    }
    $engine = $engines[$lang]
    if (-not $engine) { throw 'No text recognition language is installed' }
    $result = Wait-Op $engine.RecognizeAsync($bitmap) ([Windows.Media.Ocr.OcrResult])
    $lines = @($result.Lines | ForEach-Object {
      # Each line's box is the box around all of its words.
      $x1 = [double]::MaxValue; $y1 = [double]::MaxValue; $x2 = 0.0; $y2 = 0.0
      foreach ($w in $_.Words) {
        $r = $w.BoundingRect
        $x1 = [Math]::Min($x1, $r.X); $y1 = [Math]::Min($y1, $r.Y)
        $x2 = [Math]::Max($x2, $r.X + $r.Width); $y2 = [Math]::Max($y2, $r.Y + $r.Height)
      }
      [pscustomobject]@{ text = $_.Text; x = [int][Math]::Round($x1); y = [int][Math]::Round($y1); width = [int][Math]::Round($x2 - $x1); height = [int][Math]::Round($y2 - $y1) }
    })
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 4 -InputObject @{ id = $id; lines = $lines }))
  } catch {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @{ id = $id; error = $_.Exception.Message }))
  }
}
`

let proc: ChildProcessWithoutNullStreams | null = null
let nextId = 1
// Reads waiting for the current process's reply, by command id.
const waiting = new Map<number, (lines: OcrLine[]) => void>()

// One JSON line in plain ASCII: Windows PowerShell reads stdin in the console's code page, so
// the language name must be escaped. The image is base64, which is ASCII already.
export function ocrCommand(id: number, png: Buffer, language: string): string {
  return JSON.stringify({ id, language, png: png.toString('base64') }).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}

export function parseOcrReply(line: string): { id: number; lines: OcrLine[] } | null {
  try {
    const message = JSON.parse(line) as { id?: unknown; lines?: unknown; error?: unknown }
    if (typeof message?.id !== 'number') return null
    if (message.error !== undefined || !Array.isArray(message.lines)) {
      return { id: message.id, lines: [] }
    }
    const lines = message.lines.filter(
      (l): l is OcrLine =>
        typeof l?.text === 'string' &&
        typeof l?.x === 'number' &&
        typeof l?.y === 'number' &&
        typeof l?.width === 'number' &&
        typeof l?.height === 'number'
    )
    return { id: message.id, lines }
  } catch {
    return null
  }
}

function settleAll(): void {
  const resolvers = [...waiting.values()]
  waiting.clear()
  resolvers.forEach((resolve) => resolve([]))
}

function engine(): ChildProcessWithoutNullStreams | null {
  if (process.platform !== 'win32') return null
  if (proc && proc.exitCode === null) return proc
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    windowsHide: true
  })
  proc = child
  createInterface({ input: child.stdout }).on('line', (line) => {
    const reply = parseOcrReply(line)
    if (!reply) return
    const resolve = waiting.get(reply.id)
    waiting.delete(reply.id)
    resolve?.(reply.lines)
  })
  child.on('error', () => {
    if (proc === child) settleAll()
  })
  child.on('exit', () => {
    // A process that was replaced has no one waiting any more.
    if (proc !== child) return
    settleAll()
  })
  // Without this a closed pipe would throw in the main process.
  child.stdin.on('error', () => {})
  return child
}

// Never rejects: any failure, or no answer in time, is "no text found".
export function readText(png: Buffer, language = 'en-US'): Promise<OcrLine[]> {
  return new Promise((resolve) => {
    const id = nextId++
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (lines: OcrLine[]): void => {
      if (timer) clearTimeout(timer)
      waiting.delete(id)
      resolve(lines)
    }
    try {
      const p = engine()
      if (!p) return resolve([])
      waiting.set(id, finish)
      timer = setTimeout(() => finish([]), READ_TIMEOUT_MS)
      idle.touch()
      p.stdin.write(ocrCommand(id, png, language) + '\n')
    } catch {
      finish([])
    }
  })
}

export function shutdownOcr(): void {
  idle.cancel()
  proc?.kill()
  proc = null
  settleAll()
}

const idle = idleTimer(IDLE_MS, shutdownOcr)
