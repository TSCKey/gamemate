// Capture module: lists capturable screens/windows and grabs a screenshot of one.
import { BrowserWindow, desktopCapturer, screen } from 'electron'

// Large enough for the vision model to read the scene, small enough to keep inference fast.
const MAX_CAPTURE_WIDTH = 1280
const JPEG_QUALITY = 80
// Time for the OS to repaint after GameMate hides itself before a full-screen capture.
const HIDE_DELAY_MS = 250

export interface CaptureSource {
  id: string
  name: string
  type: 'screen' | 'window'
}

export interface Screenshot {
  // Base64-encoded JPEG, without the data: prefix (the format Ollama expects).
  base64: string
  width: number
  height: number
}

function captureSize(display = screen.getPrimaryDisplay()): { width: number; height: number } {
  const { width, height } = display.size
  const scale = Math.min(1, MAX_CAPTURE_WIDTH / width)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export async function listSources(ownWindow: BrowserWindow): Promise<CaptureSource[]> {
  const ownId = ownWindow.getMediaSourceId()
  // A 0x0 thumbnail skips rendering previews we don't need for the list.
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 }
  })
  return sources
    .filter((s) => s.id !== ownId && s.name.trim() !== '')
    .map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen:') ? 'screen' : 'window'
    }))
}

// Screenshot of one monitor, used by the floating window. The floating window has content
// protection on, so it never appears in this capture.
export async function captureDisplay(displayId: number): Promise<Screenshot> {
  const display = screen.getAllDisplays().find((d) => d.id === displayId)
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: captureSize(display)
  })
  const source = sources.find((s) => s.display_id === String(displayId)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture the screen.')
  const { width, height } = source.thumbnail.getSize()
  return { base64: source.thumbnail.toJPEG(JPEG_QUALITY).toString('base64'), width, height }
}

export async function captureSource(
  sourceId: string,
  ownWindow: BrowserWindow
): Promise<Screenshot> {
  const isScreen = sourceId.startsWith('screen:')
  // Hide GameMate so it doesn't appear in its own screenshot of the screen.
  const hide = isScreen && ownWindow.isVisible() && !ownWindow.isMinimized()
  if (hide) {
    ownWindow.hide()
    await new Promise((resolve) => setTimeout(resolve, HIDE_DELAY_MS))
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: [isScreen ? 'screen' : 'window'],
      thumbnailSize: captureSize()
    })
    const source = sources.find((s) => s.id === sourceId)
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error('That window is no longer available. Pick another one to capture.')
    }
    const { width, height } = source.thumbnail.getSize()
    return { base64: source.thumbnail.toJPEG(JPEG_QUALITY).toString('base64'), width, height }
  } finally {
    if (hide) ownWindow.show()
  }
}
