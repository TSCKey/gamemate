// The Gemini API key, encrypted with Windows' per-user protection (DPAPI via safeStorage).
// It stays in the main process: the renderer can set or clear it, but never read it back.
import { app, safeStorage } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { t } from './i18n'

const file = (): string => join(app.getPath('userData'), 'gemini-key.bin')
let cached: string | null | undefined

export function getGeminiKey(): string | null {
  if (cached !== undefined) return cached
  try {
    cached = safeStorage.decryptString(readFileSync(file()))
  } catch {
    cached = null
  }
  return cached
}

export function hasGeminiKey(): boolean {
  return !!getGeminiKey()
}

export function setGeminiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(t('errors.gemini.cantEncrypt'))
  }
  writeFileSync(file(), safeStorage.encryptString(key))
  cached = key
}

export function clearGeminiKey(): void {
  rmSync(file(), { force: true })
  cached = null
}
