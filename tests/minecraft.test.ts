import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => join(__dirname, '..') } }))

const { listVersions, lookupRecipe } = await import('../src/main/games/minecraft')

describe('recipe cards', () => {
  const version = listVersions()[0]

  it('names the item whose icon each ingredient shows', () => {
    const [piston] = lookupRecipe(version, 'piston').views
    expect(piston.item).toBe('Piston')
    // Every ingredient in the grid has an icon item.
    for (const label of piston.grid.flat()) {
      if (label) expect(piston.iconItems[label]).toBeTruthy()
    }
    // "Any Planks" shows the planks players know best.
    const planks = Object.keys(piston.iconItems).find((l) => /planks/i.test(l))
    expect(planks && piston.iconItems[planks]).toBe('Oak Planks')
  })
})
