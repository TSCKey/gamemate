import { useCallback, useEffect, useState } from 'react'
import type { ModelInfo, Settings } from '../../preload/index.d'

export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  // ipcRenderer.invoke wraps main-process errors in a generic prefix; strip it.
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

// Settings and installed models, kept in sync between the main and floating windows.
export function useSettings(): {
  settings: Settings | null
  models: ModelInfo[]
  modelError: string | null
  update: (patch: Partial<Settings>) => void
  reloadModels: () => Promise<void>
} {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelError, setModelError] = useState<string | null>(null)

  const update = useCallback((patch: Partial<Settings>) => {
    window.api.updateSettings(patch).then(setSettings)
  }, [])

  const reloadModels = useCallback(async (): Promise<void> => {
    try {
      const [list, current] = await Promise.all([window.api.listModels(), window.api.getSettings()])
      setModels(list)
      setModelError(list.length === 0 ? 'No models installed. Run: ollama pull qwen3.5:2b' : null)
      // Pick a model automatically the first time, preferring one that can see screenshots.
      if (list.length > 0 && !list.some((m) => m.name === current.model)) {
        update({ model: (list.find((m) => m.vision) ?? list[0]).name })
      }
    } catch (e) {
      setModelError(errorMessage(e))
    }
  }, [update])

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the IPC call resolves
    reloadModels()
    return window.api.onSettingsChanged(setSettings)
  }, [reloadModels])

  return { settings, models, modelError, update, reloadModels }
}
