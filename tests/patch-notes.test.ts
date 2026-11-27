import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  allPatchNotes,
  compareVersions,
  patchNotesSince,
  shouldShowPatchNotes
} from '../src/renderer/src/patchNotes'
import { parseMarkdown } from '../src/renderer/src/legal/markdown'
import { LANGUAGES } from '../src/shared/languages'

const DIR = join(__dirname, '..', 'src', 'shared', 'patchNotes')
const version = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version

describe('the patch notes', () => {
  it('exist for this version', () => {
    expect(readdirSync(DIR)).toContain(version)
  })

  it('are written in all eight languages for every version, with something to read', () => {
    for (const v of readdirSync(DIR)) {
      const files = readdirSync(join(DIR, v)).sort()
      expect(files, v).toEqual(LANGUAGES.map((l) => `${l.code}.md`).sort())
      for (const file of files) {
        const blocks = parseMarkdown(readFileSync(join(DIR, v, file), 'utf8'))
        expect(blocks.length, `${v}/${file}`).toBeGreaterThan(0)
      }
    }
  })

  it('are bundled with the app in the player’s language', () => {
    const notes = allPatchNotes('de')
    expect(notes[0].version).toBe(version)
    expect(notes[0].markdown).toContain('acht Sprachen')
  })
})

describe('comparing versions', () => {
  it('compares each number, not the text', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0)
    expect(compareVersions('0.4.0', '0.4.0')).toBe(0)
    expect(compareVersions('0.3.0', '0.4.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
  })
})

describe('the notes since the last version the player saw', () => {
  it('are the newer versions up to this one, newest first', () => {
    const notes = patchNotesSince('0.3.0', '0.4.0', 'fr')
    expect(notes.map((n) => n.version)).toEqual(['0.4.0'])
    expect(notes[0].markdown).toContain('huit langues')
  })

  it('are none once the player has seen this version', () => {
    expect(patchNotesSince('0.4.0', '0.4.0', 'en')).toEqual([])
  })

  it('are only the bundled versions, never newer than the app', () => {
    expect(patchNotesSince('', '0.4.0', 'en').map((n) => n.version)).toEqual(['0.4.0'])
    expect(patchNotesSince('0.3.0', '0.3.5', 'en')).toEqual([])
  })

  it('fall back to English for a language without a file', () => {
    const files = {
      '../../shared/patchNotes/0.5.0/en.md': '## English',
      '../../shared/patchNotes/0.4.0/en.md': '## Old'
    }
    expect(patchNotesSince('0.4.0', '0.5.0', 'hi', files)).toEqual([
      { version: '0.5.0', markdown: '## English' }
    ])
  })
})

describe('showing the notes', () => {
  const s = { lastSeenVersion: '0.3.0' }
  it('happens after an update, once nothing else is in front', () => {
    expect(shouldShowPatchNotes(s, '0.4.0', false)).toBe(true)
    expect(shouldShowPatchNotes(s, '0.4.0', true)).toBe(false)
  })

  it('doesn’t happen once the notes were seen, or before the version is known', () => {
    expect(shouldShowPatchNotes({ lastSeenVersion: '0.4.0' }, '0.4.0', false)).toBe(false)
    expect(shouldShowPatchNotes(s, '', false)).toBe(false)
  })

  it('doesn’t happen for a version without notes', () => {
    expect(shouldShowPatchNotes({ lastSeenVersion: '0.4.0' }, '0.4.1', false)).toBe(false)
  })
})
