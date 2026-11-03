import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-voice-models-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
  net: {}
}))

const { speechModelStatuses } = await import('../src/main/voice/voiceModels')

describe('the voice model store', () => {
  it('offers the Supertonic voice as a 401 MB download', () => {
    const supertonic = speechModelStatuses().find((m) => m.id === 'supertonic')
    expect(supertonic).toMatchObject({ kind: 'speak', sizeMb: 401, installed: false })
  })
})
