import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'
import { findUiText } from './helpers/ui-text'

const RENDERER = join(__dirname, '../src/renderer/src')

// Every window file a player's text could be in (workers report errors to the log, not players).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|ts)$/.test(name) && !/\.worker\.ts$|\.d\.ts$/.test(name) ? [path] : []
  })
}

describe("the windows' texts", () => {
  it('all come from the translation files', () => {
    const left = sourceFiles(RENDERER).flatMap((file) =>
      findUiText(file).map((f) => `${relative(RENDERER, f.file)}:${f.line} ${f.kind} "${f.text}"`)
    )
    expect(left, left.join('\n')).toEqual([])
  })
})
