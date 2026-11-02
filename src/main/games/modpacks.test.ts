import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readModpack, searchMods } from './modpacks'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gamemate-pack-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('readModpack', () => {
  it("reads CurseForge's instance file, even with a byte-order mark", async () => {
    const instance = {
      name: 'All the Mods',
      gameVersion: '1.21.1',
      baseModLoader: { name: 'neoforge-21.1.77' },
      installedAddons: [
        { name: 'Mekanism', webSiteURL: 'https://example.test/mekanism' },
        { name: 'Create', isEnabled: true },
        { name: 'Disabled Mod', isEnabled: false }
      ]
    }
    await writeFile(join(dir, 'minecraftinstance.json'), '﻿' + JSON.stringify(instance))
    const pack = await readModpack(dir)
    expect(pack?.name).toBe('All the Mods')
    expect(pack?.minecraftVersion).toBe('1.21.1')
    expect(pack?.mods.map((m) => m.name)).toEqual(['Create', 'Mekanism'])
  })

  it('falls back to the jars in the mods folder', async () => {
    await mkdir(join(dir, 'mods'))
    await writeFile(join(dir, 'mods', 'create-1.21.1-6.0.4.jar'), '')
    await writeFile(join(dir, 'mods', 'notes.txt'), '')
    const pack = await readModpack(dir)
    expect(pack?.mods).toHaveLength(1)
  })

  it('treats a folder without mods as plain Minecraft', async () => {
    expect(await readModpack(dir)).toBeNull()
  })
})

describe('searchMods', () => {
  const pack = {
    name: 'Pack',
    path: '',
    minecraftVersion: '',
    loader: '',
    mods: [{ name: 'Create' }, { name: 'Create: Steam n Rails' }, { name: 'Mekanism' }]
  }

  it('lists mods matching every word', () => {
    expect(searchMods(pack, 'create rails')).toContain('Create: Steam n Rails')
    expect(searchMods(pack, 'create rails')).not.toContain('Mekanism')
  })

  it('says when nothing matches', () => {
    expect(searchMods(pack, 'botania')).toMatch(/No installed mod/)
  })
})
