import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'gamemate-companion-settings-'))
vi.mock('electron', () => ({
  app: { getPath: () => userData, getAppPath: () => join(__dirname, '..') },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('koffi', () => ({ default: {} }))

const load = async (): Promise<typeof import('../src/main/system/settings')> => {
  vi.resetModules()
  return import('../src/main/system/settings')
}

const file = join(userData, 'settings.json')

beforeEach(() => writeFileSync(file, '{}'))

describe('companion settings', () => {
  it('keep the existing defaults and add sensible new ones', async () => {
    const { getSettings } = await load()
    expect(getSettings()).toMatchObject({
      companionMode: 'on-demand',
      commentaryFrequency: 'normal',
      commentaryEngine: 'local',
      speakComments: false,
      showComments: true,
      hideCommentsInFullscreen: false,
      commentaryIntensity: 'normal',
      commentaryHumor: 'light',
      commentaryTactics: true,
      commentaryCategories: {
        combat: true,
        skill: true,
        teamwork: true,
        objectives: true,
        match: true,
        world: true
      }
    })
  })

  it('keep the player’s in-game names to one short, clean line', async () => {
    const { getSettings, updateSettings } = await load()
    expect(getSettings().commentaryPlayerNames).toBe('')
    expect(
      updateSettings({ commentaryPlayerNames: ' TSCKEY, Tsc#EUW ' }).commentaryPlayerNames
    ).toBe('TSCKEY, Tsc#EUW')
    expect(updateSettings({ commentaryPlayerNames: 42 }).commentaryPlayerNames).toBe(
      'TSCKEY, Tsc#EUW'
    )
    const long = updateSettings({ commentaryPlayerNames: `a\nb${'x'.repeat(500)}` })
    expect(long.commentaryPlayerNames).not.toMatch(/\n/)
    expect(long.commentaryPlayerNames.length).toBeLessThanOrEqual(120)
  })

  it('accept valid choices', async () => {
    const { updateSettings } = await load()
    expect(
      updateSettings({
        commentaryIntensity: 'expressive',
        commentaryHumor: 'playful',
        commentaryTactics: false
      })
    ).toMatchObject({
      commentaryIntensity: 'expressive',
      commentaryHumor: 'playful',
      commentaryTactics: false
    })
  })

  it('refuse values from nowhere', async () => {
    const { updateSettings } = await load()
    const next = updateSettings({
      commentaryIntensity: 'screaming',
      commentaryHumor: 42,
      commentaryTactics: 'yes'
    })
    expect(next).toMatchObject({
      commentaryIntensity: 'normal',
      commentaryHumor: 'light',
      commentaryTactics: true
    })
  })

  it('change one category at a time', async () => {
    const { updateSettings } = await load()
    const next = updateSettings({ commentaryCategories: { combat: false } })
    expect(next.commentaryCategories.combat).toBe(false)
    expect(next.commentaryCategories.match).toBe(true)
  })

  it('ignore unknown categories and non-boolean values', async () => {
    const { updateSettings } = await load()
    const next = updateSettings({ commentaryCategories: { hacking: true, match: 'off' } })
    expect(Object.keys(next.commentaryCategories)).not.toContain('hacking')
    expect(next.commentaryCategories.match).toBe(true)
  })

  it('ignore a category list that is not a list', async () => {
    const { updateSettings } = await load()
    expect(updateSettings({ commentaryCategories: 'all' }).commentaryCategories.combat).toBe(true)
  })

  it('can read comments aloud without the pop-up', async () => {
    const { updateSettings } = await load()
    expect(updateSettings({ speakComments: true, showComments: false })).toMatchObject({
      speakComments: true,
      showComments: false
    })
  })

  it('can keep the pop-up off a fullscreen game', async () => {
    const { updateSettings } = await load()
    expect(updateSettings({ hideCommentsInFullscreen: true }).hideCommentsInFullscreen).toBe(true)
    expect(updateSettings({ hideCommentsInFullscreen: 'yes' }).hideCommentsInFullscreen).toBe(true)
    expect(updateSettings({ hideCommentsInFullscreen: false }).hideCommentsInFullscreen).toBe(false)
  })

  it('never leave comments with no way of reaching the player', async () => {
    const { updateSettings } = await load()
    expect(updateSettings({ showComments: false }).showComments).toBe(true)
    updateSettings({ speakComments: true, showComments: false })
    expect(updateSettings({ speakComments: false }).showComments).toBe(true)
  })

  it('fill in what older saved settings lack', async () => {
    writeFileSync(
      file,
      JSON.stringify({
        companionMode: 'commentary',
        commentaryFrequency: 'rare',
        commentaryCategories: { combat: false }
      })
    )
    const { getSettings } = await load()
    expect(getSettings()).toMatchObject({
      companionMode: 'commentary',
      commentaryFrequency: 'rare',
      commentaryIntensity: 'normal',
      commentaryCategories: { combat: false, match: true, world: true }
    })
  })
})

describe('the settings’ texts', () => {
  const KEYS = [
    'companion.intensities.subtle',
    'companion.intensities.expressive',
    'companion.humorLevels.none',
    'companion.humorLevels.playful',
    'companion.delivery.text',
    'companion.delivery.voice',
    'companion.delivery.both',
    'companion.categories.combat',
    'companion.categories.skill',
    'companion.categories.teamwork',
    'companion.categories.objectives',
    'companion.categories.match',
    'companion.categories.world',
    'companionPanel.reactionIntensity',
    'companionPanel.humorLevel',
    'companionPanel.tacticalComments',
    'companionPanel.tacticalCommentsHelp',
    'companionPanel.showReactionsAs',
    'companionPanel.whatToReactTo',
    'companionPanel.whatToReactToHelp'
  ]

  it('exist in every language', async () => {
    const { resources } = await import('../src/shared/i18n')
    const { LANGUAGES } = await import('../src/shared/languages')
    for (const { code } of LANGUAGES) {
      const translation = resources[code].translation
      for (const key of KEYS) {
        const text = key
          .split('.')
          .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], translation)
        expect(typeof text === 'string' && text.length > 0, `${code}: ${key}`).toBe(true)
      }
    }
  })

  it('name the frequency choices Rare, Balanced and Frequent', async () => {
    const { resources } = await import('../src/shared/i18n')
    const frequencies = (resources.en.translation as { companion: { frequencies: object } })
      .companion.frequencies
    expect(frequencies).toEqual({
      rare: 'Rare (big moments only)',
      normal: 'Balanced',
      frequent: 'Frequent'
    })
  })
})
