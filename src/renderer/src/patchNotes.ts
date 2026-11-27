// What changed in each version, shown once after GameMate updates itself and from Settings →
// General → What's new. Bundled with the app (src/shared/patchNotes/<version>/<language>.md),
// so they're there offline; the English file is also the GitHub release text.
import type { LanguageCode } from '../../shared/languages'

export interface PatchNotes {
  version: string
  markdown: string
}

const BUNDLED: Record<string, string> = import.meta.glob('../../shared/patchNotes/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
})
const PATH = /patchNotes\/(\d+\.\d+\.\d+)\/(\w+)\.md$/

// Negative when a is older than b, positive when newer ('0.10.0' is newer than '0.9.1').
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split('.').map((n) => Number(n) || 0))
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

// Every bundled version's notes in the language (English where a translation is missing),
// newest first.
export function allPatchNotes(
  language: LanguageCode,
  files: Record<string, string> = BUNDLED
): PatchNotes[] {
  const byVersion = new Map<string, Partial<Record<string, string>>>()
  for (const [path, markdown] of Object.entries(files)) {
    const m = PATH.exec(path)
    if (!m) continue
    byVersion.set(m[1], { ...byVersion.get(m[1]), [m[2]]: markdown })
  }
  return [...byVersion]
    .map(([version, texts]) => ({ version, markdown: texts[language] ?? texts.en ?? '' }))
    .filter((n) => n.markdown)
    .sort((a, b) => compareVersions(b.version, a.version))
}

// The notes of every version newer than the last one the player saw, up to this one.
export function patchNotesSince(
  lastSeen: string,
  current: string,
  language: LanguageCode,
  files: Record<string, string> = BUNDLED
): PatchNotes[] {
  return allPatchNotes(language, files).filter(
    (n) =>
      compareVersions(n.version, lastSeen || '0.0.0') > 0 &&
      compareVersions(n.version, current) <= 0
  )
}

// After an update, once the language, Terms and first-start screens are out of the way.
export function shouldShowPatchNotes(
  settings: { lastSeenVersion: string },
  current: string,
  blocked: boolean
): boolean {
  if (blocked || !current || settings.lastSeenVersion === current) return false
  return patchNotesSince(settings.lastSeenVersion, current, 'en').length > 0
}
