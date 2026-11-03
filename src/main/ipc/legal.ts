// The Terms of Use: accepting and withdrawing them, and the actions that wait for them. Until the
// player accepts, GameMate doesn't go online, look at the PC or take screenshots.
import { app } from 'electron'
import { stopEngine } from '../ai/llamaEngine'
import { gateChannels, handle } from '../system/security'
import { acceptTerms, termsAccepted, withdrawTerms } from '../system/settings'
import { hideOverlay } from '../windows/overlay'
import { t } from '../system/i18n'

// Requests that go online, read the PC or capture the screen.
export const AFTER_TERMS = new Set([
  'assistant:ask',
  'capture:list-sources',
  'capture:screenshot',
  'overlay:take-screenshot',
  'games:scan',
  'games:running-apps',
  'games:add',
  'games:set-wiki',
  'games:wiki-choices',
  'modpacks:list',
  'modpacks:current',
  'local-models:download',
  'voice:download',
  'gemini:set-key',
  'gemini:models',
  'updates:check',
  'updates:install'
])

export function registerLegalHandlers(): void {
  gateChannels((channel) => {
    if (AFTER_TERMS.has(channel) && !termsAccepted()) {
      throw new Error(t('errors.terms.notAccepted'))
    }
  })
  handle('legal:accept', (_event, ageConfirmed: unknown) => {
    if (ageConfirmed !== true) throw new Error(t('errors.terms.age'))
    return acceptTerms()
  })
  handle('legal:withdraw', async () => {
    const settings = withdrawTerms()
    hideOverlay()
    // Nothing keeps working in the background until the player accepts again.
    await stopEngine()
    return settings
  })
  handle('app:quit', () => app.quit())
}
