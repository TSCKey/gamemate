import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'
import en from '../src/shared/i18n/en.json'

const SRC = join(__dirname, '../src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

function text(key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
  }, en)
  return typeof value === 'string' ? value : undefined
}

describe('translated texts', () => {
  // A text with {{size}} or {{name}} shown without its values reaches the player as "{{size}}".
  it('always get the values their placeholders need', () => {
    const missing: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const call of source.matchAll(/\bt\(\s*'([\w.]+)'\s*\)/g)) {
        const value = text(call[1])
        if (value?.includes('{{')) {
          const line = source.slice(0, call.index).split('\n').length
          missing.push(`${relative(SRC, file)}:${line} ${call[1]} = "${value}"`)
        }
      }
    }
    expect(missing, missing.join('\n')).toEqual([])
  })
})
