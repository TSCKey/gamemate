// The developer inspector: a window that shows what went through the event pipeline, live, and
// can save it as a trace file. It exists only when GameMate runs from its source (npm start) with
// GAMEMATE_INSPECTOR=1; a release build never opens it and never turns the tap on. Its text is
// for developers and is not translated.
import { writeFileSync } from 'fs'
import { app, BrowserWindow, dialog } from 'electron'
import { pipelineTap } from './tap'

const SAVE_MESSAGE = 'gamemate:save-trace'
const SHOWN = 300

// The page renders with textContent only: names read off a game screen are never markup.
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<title>GameMate pipeline inspector (development)</title>
<style>
body { font: 12px system-ui, sans-serif; margin: 0; background: #111; color: #ddd; }
header { position: sticky; top: 0; background: #222; padding: 6px 10px; display: flex; gap: 12px; align-items: center; }
table { border-collapse: collapse; width: 100%; }
td, th { padding: 2px 6px; border-bottom: 1px solid #2a2a2a; text-align: left; vertical-align: top; }
th { color: #999; font-weight: normal; }
.verified, .telemetry { color: #7fd17f; } .model { color: #e0b050; } .inferred { color: #79b8ff; }
.filtered, .duplicate, .settled { color: #888; } .spoken { color: #fff; font-weight: bold; }
</style></head>
<body>
<header><strong>Pipeline</strong>
<label><input type="checkbox" id="pause"> pause</label>
<label><input type="checkbox" id="quiet"> hide observations</label>
<button id="save">Save trace</button><span id="count"></span></header>
<table><thead><tr><th>time</th><th>stage</th><th>adapter</th><th>type</th><th>basis</th><th>conf.</th><th>commentary</th><th>latency</th><th>summary</th><th>from</th></tr></thead>
<tbody id="rows"></tbody></table>
<script>
const rows = document.getElementById('rows')
document.getElementById('save').onclick = () => console.log('${SAVE_MESSAGE}')
const cell = (tr, text, cls) => { const td = document.createElement('td'); td.textContent = text ?? ''; if (cls) td.className = cls; tr.appendChild(td) }
window.show = (entries) => {
  if (document.getElementById('pause').checked) return
  const quiet = document.getElementById('quiet').checked
  rows.replaceChildren()
  for (const e of entries.slice().reverse()) {
    if (quiet && e.stage === 'observation') continue
    const tr = document.createElement('tr')
    tr.className = e.stage
    cell(tr, new Date(e.at).toLocaleTimeString())
    cell(tr, e.stage)
    cell(tr, e.adapterId)
    cell(tr, e.type)
    cell(tr, e.basis, e.basis)
    cell(tr, e.confidence === undefined ? '' : e.confidence.toFixed(2))
    cell(tr, e.commentary)
    cell(tr, e.latencyMs === undefined ? '' : Math.round(e.latencyMs) + ' ms')
    cell(tr, e.summary)
    cell(tr, (e.related || []).join(', '))
    rows.appendChild(tr)
  }
  document.getElementById('count').textContent = entries.length + ' entries'
}
</script></body></html>`

// Whether this run may have the inspector: from source, and asked for.
export function inspectorAllowed(packaged: boolean, env: NodeJS.ProcessEnv): boolean {
  return !packaged && env['GAMEMATE_INSPECTOR'] === '1'
}

export function openInspectorIfAsked(): void {
  if (!inspectorAllowed(app.isPackaged, process.env)) return
  pipelineTap.enabled = true
  const win = new BrowserWindow({
    width: 1100,
    height: 640,
    title: 'GameMate pipeline inspector (development)',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
  const push = (): void => {
    if (win.isDestroyed()) return
    const entries = JSON.stringify(pipelineTap.entries().slice(-SHOWN))
    win.webContents.executeJavaScript(`window.show(${entries})`).catch(() => {})
  }
  const timer = setInterval(push, 1000)
  win.webContents.on('console-message', (details) => {
    if (details.message !== SAVE_MESSAGE) return
    dialog
      .showSaveDialog(win, { defaultPath: `gamemate-trace-${Date.now()}.jsonl` })
      .then(({ filePath }) => {
        if (filePath) writeFileSync(filePath, pipelineTap.toJsonl())
      })
      .catch((error) => console.error('Could not save the trace', error))
  })
  win.on('closed', () => {
    clearInterval(timer)
    pipelineTap.enabled = false
    pipelineTap.clear()
  })
  console.info('Pipeline inspector open (development only)')
}
