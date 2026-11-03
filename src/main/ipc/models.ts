// The built-in engine's models and the player's Gemini key.
import { primeModel } from '../ai/engines'
import { listGeminiModels } from '../ai/gemini'
import { runningModel, stopEngine } from '../ai/llamaEngine'
import {
  cancelLocalModel,
  downloadLocalModel,
  isLocalModelId,
  isLocalModelInstalled,
  localModelStatuses,
  removeLocalModel
} from '../ai/localModels'
import { clearGeminiKey, getGeminiKey, hasGeminiKey, setGeminiKey } from '../system/secrets'
import { handle } from '../system/security'
import { getSettings, updateSettings } from '../system/settings'
import { t } from '../system/i18n'

export function registerModelHandlers(): void {
  handle('local-models:list', () => localModelStatuses())
  handle('local-models:download', async (_event, id: unknown) => {
    if (!isLocalModelId(id)) throw new Error('Unknown model.')
    const done = await downloadLocalModel(id)
    // A freshly downloaded model is used if the chosen one isn't there yet.
    if (done && !isLocalModelInstalled(getSettings().builtinModel)) {
      updateSettings({ builtinModel: id })
    }
    const settings = getSettings()
    if (done && settings.localBackend === 'builtin' && settings.builtinModel === id) primeModel(id)
  })
  handle('local-models:cancel', async (_event, id: unknown) => {
    if (isLocalModelId(id)) await cancelLocalModel(id)
  })
  handle('local-models:remove', async (_event, id: unknown) => {
    if (!isLocalModelId(id)) return
    if (runningModel() === id) await stopEngine()
    await removeLocalModel(id)
  })
  handle('gemini:status', () => ({ hasKey: hasGeminiKey() }))
  handle('gemini:set-key', async (_event, key: unknown) => {
    if (!getSettings().geminiConsent) throw new Error(t('errors.gemini.needConsent'))
    // Key formats change (newer ones contain dots), so only drop stray whitespace and quotes
    // from copy-pasting and require characters that are safe in a header; Google does the
    // real check below.
    const trimmed =
      typeof key === 'string' ? key.replace(/\s+/g, '').replace(/^["']|["']$/g, '') : ''
    if (!/^[\x21-\x7e]{20,300}$/.test(trimmed)) {
      throw new Error(t('errors.gemini.notAKey'))
    }
    // Check the key works before saving it.
    const models = await listGeminiModels(trimmed)
    setGeminiKey(trimmed)
    return models
  })
  handle('gemini:clear-key', () => clearGeminiKey())
  handle('gemini:models', () => {
    const key = getGeminiKey()
    return key ? listGeminiModels(key) : []
  })
}
