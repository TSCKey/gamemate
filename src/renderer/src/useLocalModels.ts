import { useEffect, useState } from 'react'
import type { LocalModelStatus, ModelInfo, Settings } from '../../preload/index.d'

// Built-in engine models and their download progress, kept in sync with the main process.
export function useLocalModels(): LocalModelStatus[] {
  const [models, setModels] = useState<LocalModelStatus[]>([])
  useEffect(() => {
    window.api.localModels.list().then(setModels)
    return window.api.localModels.onChange(setModels)
  }, [])
  return models
}

// What "On this PC" means right now: a built-in model or an Ollama one.
export function localModelInfo(
  settings: Settings,
  localModels: LocalModelStatus[],
  ollamaModels: ModelInfo[]
): { ready: boolean; name: string; vision: boolean } {
  if (settings.localBackend === 'builtin') {
    const model = localModels.find((m) => m.id === settings.builtinModel)
    // Every built-in model can see screenshots.
    return { ready: !!model?.installed, name: model?.name ?? 'Built-in AI', vision: true }
  }
  return {
    ready: Boolean(settings.model),
    name: settings.model || 'Ollama',
    vision: ollamaModels.find((m) => m.name === settings.model)?.vision ?? false
  }
}

export function formatSize(sizeMb: number): string {
  return sizeMb >= 1000 ? `${(sizeMb / 1000).toFixed(1)} GB` : `${sizeMb} MB`
}
