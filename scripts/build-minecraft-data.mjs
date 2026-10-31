/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain Node script */
// Downloads Minecraft item and crafting recipe data from PrismarineJS/minecraft-data
// (MIT licensed) and writes a compact, merged copy per version to resources/minecraft/.
//
// Usage: node scripts/build-minecraft-data.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pinned so the generated data is reproducible. Bump to pick up new game versions.
const COMMIT = 'bd8b5c6048e5af9694374b83f25f5b4aade619cc'
const VERSIONS = ['26.1', '1.21.11', '1.21.4', '1.20.4']
const BASE = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/${COMMIT}/data`
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'minecraft')

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json()
}

// "Oak Planks", "Spruce Planks" -> "Any Planks"; otherwise list the options.
function labelFor(names, itemsByName) {
  const display = names.map((n) => itemsByName.get(n)?.displayName ?? n)
  if (display.length === 1) return display[0]
  const words = display.map((d) => d.split(' '))
  const suffix = []
  for (let i = 1; ; i++) {
    const w = words[0][words[0].length - i]
    if (!w || !words.every((ws) => ws.length > i - 1 && ws[ws.length - i] === w)) break
    suffix.unshift(w)
  }
  if (suffix.length > 0 && display.length > 2) return `Any ${suffix.join(' ')}`
  return display.length <= 3 ? display.join(' or ') : `Any of: ${display.join(', ')}`
}

// minecraft-data lists one recipe per ingredient variant (e.g. 12 bookshelf recipes, one per
// wood type). Merge variants that share a layout into one recipe whose slots list every option.
function mergeRecipes(raw, itemsById) {
  const groups = new Map()
  for (const r of raw) {
    const count = r.result.count ?? 1
    if (r.inShape) {
      const shape = r.inShape.map((row) =>
        row.map((id) => (id == null ? null : itemsById.get(id).name))
      )
      const key = `shaped|${count}|${shape.map((row) => row.map((c) => (c ? 'x' : '.')).join('')).join('/')}`
      const group = groups.get(key) ?? {
        type: 'shaped',
        count,
        slots: shape.map((row) => row.map((c) => (c ? new Set() : null)))
      }
      shape.forEach((row, y) => row.forEach((c, x) => c && group.slots[y][x].add(c)))
      groups.set(key, group)
    } else if (r.ingredients) {
      const names = r.ingredients.map((id) => itemsById.get(id).name).sort()
      const key = `shapeless|${count}|${names.length}`
      const group = groups.get(key) ?? {
        type: 'shapeless',
        count,
        slots: names.map(() => new Set())
      }
      names.forEach((n, i) => group.slots[i].add(n))
      groups.set(key, group)
    }
  }
  return [...groups.values()]
}

function toOutput(group, itemsByName) {
  // Give each distinct option set one ingredient entry; slots reference it by index.
  const ingredients = []
  const indexOf = (set) => {
    const options = [...set].sort()
    const key = options.join(',')
    let i = ingredients.findIndex((ing) => ing.options.join(',') === key)
    if (i === -1) {
      i = ingredients.push({ label: labelFor(options, itemsByName), options }) - 1
    }
    return i
  }
  if (group.type === 'shaped') {
    const grid = group.slots.map((row) => row.map((s) => (s ? indexOf(s) : null)))
    return { type: 'shaped', count: group.count, grid, ingredients }
  }
  const slots = group.slots.map(indexOf)
  return { type: 'shapeless', count: group.count, slots, ingredients }
}

async function buildVersion(version, dataPaths) {
  const paths = dataPaths.pc[version]
  const [items, recipes] = await Promise.all([
    fetchJson(`${paths.items}/items.json`),
    fetchJson(`${paths.recipes}/recipes.json`)
  ])
  const itemsById = new Map(items.map((i) => [i.id, i]))
  const itemsByName = new Map(items.map((i) => [i.name, i]))

  const outRecipes = {}
  for (const [resultId, raw] of Object.entries(recipes)) {
    const item = itemsById.get(Number(resultId))
    if (!item) continue
    outRecipes[item.name] = mergeRecipes(raw, itemsById).map((g) => toOutput(g, itemsByName))
  }

  const data = {
    version,
    source: `PrismarineJS/minecraft-data@${COMMIT.slice(0, 7)} (MIT)`,
    items: items.map((i) => ({ name: i.name, displayName: i.displayName, stackSize: i.stackSize })),
    recipes: outRecipes
  }
  const file = join(OUT_DIR, `${version}.json`)
  await writeFile(file, JSON.stringify(data))
  console.log(
    `${version}: ${items.length} items, ${Object.keys(outRecipes).length} craftable -> ${file}`
  )
}

await mkdir(OUT_DIR, { recursive: true })
const dataPaths = await fetchJson('dataPaths.json')
for (const version of VERSIONS) await buildVersion(version, dataPaths)
await writeFile(join(OUT_DIR, 'versions.json'), JSON.stringify(VERSIONS))
