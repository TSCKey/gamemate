// Finds player-facing English text written directly in the windows' code, so it can be moved
// into the translation files (and so new code doesn't add any). Uses TypeScript's parser.
import { readFileSync } from 'fs'
import ts from 'typescript'

export interface Found {
  file: string
  line: number
  text: string
  kind: 'jsx-text' | 'attribute' | 'string'
  node: ts.Node
}

// Attributes whose value players read.
const READ_ATTRIBUTES = new Set([
  'label',
  'help',
  'title',
  'placeholder',
  'description',
  'aria-label',
  'alt'
])
// Texts that are the same in every language.
const SAME_EVERYWHERE = new Set([
  'GameMate',
  'GM',
  '✕',
  '→',
  '·',
  '…',
  '📷',
  '🎤',
  '🎮',
  '⚙',
  '▾',
  '×'
])

// Web addresses shown as link text ("aistudio.google.com") read the same everywhere too.
const sameEverywhere = (text: string): boolean =>
  SAME_EVERYWHERE.has(text.trim()) || /^[\w-]+(\.[\w-]+)+$/.test(text.trim())

// Product and game names: not translated.
const NAMES =
  /^(GameMate|Minecraft|Gemini|Google|Ollama|Steam|Epic Games|Battle\.net|Riot|Modrinth|Supertonic|Whisper|Windows|GitHub|Qwen[\w.]*|CurseForge|Fandom|wiki\.gg|Hugging Face|AI)$/

// Letters other than in product names.
const hasLetter = (text: string): boolean =>
  /\p{L}/u.test(
    text
      .split(/[\s·:,()]+/)
      .filter((w) => !NAMES.test(w) && !NAMES.test(text.trim()))
      .join(' ')
  )

// A string in code that reads like text for a player: words with a space or sentence punctuation,
// and not a list of CSS class names ("bubble bubble-assistant").
export function readsLikeText(text: string): boolean {
  const t = text.trim()
  if (!hasLetter(t) || sameEverywhere(t)) return false
  if (!/\s/.test(t) && !/[.!?…:]$/.test(t)) return false
  const tokens = t.split(/\s+/)
  const cssLike = tokens.every((w) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(w)) && /-/.test(t)
  if (cssLike) return false
  // Paths, addresses and code.
  if (/^(https?:|gm-model:|\.{0,2}\/|[\w-]+\/[\w-])/.test(t) || /[{};=<>]/.test(t)) return false
  // CSS values ("0 0 0 4px rgba(…)").
  if (/\d\s*px|rgba?\(/.test(t)) return false
  return true
}

// A value shown as an element's text ({busy ? 'Saving' : 'Save'}): single words count there too.
const shownAsText = (node: ts.Node): boolean => {
  let n = node.parent
  while (
    n &&
    (ts.isConditionalExpression(n) || ts.isBinaryExpression(n) || ts.isParenthesizedExpression(n))
  ) {
    n = n.parent
  }
  return !!n && ts.isJsxExpression(n) && !!n.parent && !ts.isJsxAttribute(n.parent)
}

// An object's value or a choice's result ({ label: 'Fast' }, ready ? 'Quick' : 'Slow', x ?? 'Game').
const isValue = (node: ts.Node): boolean => {
  const p = node.parent
  if (ts.isPropertyAssignment(p)) return p.initializer === node
  if (ts.isConditionalExpression(p)) return p.condition !== node
  return (
    ts.isBinaryExpression(p) &&
    [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(p.operatorToken.kind)
  )
}

export function findUiText(file: string): Found[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const found: Found[] = []
  const add = (node: ts.Node, text: string, kind: Found['kind']): void => {
    found.push({
      file,
      line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      text: text.trim(),
      kind,
      node
    })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    // Already translated, logged or a type: skip.
    if (
      ts.isCallExpression(node) &&
      /^(t|i18next\.t|console\.\w+|Trans)$/.test(node.expression.getText())
    ) {
      return
    }
    if (ts.isJsxText(node)) {
      const text = node.getText()
      if (hasLetter(text) && !sameEverywhere(text)) add(node, text, 'jsx-text')
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText()
      const value = node.initializer
      const literal =
        value && ts.isStringLiteral(value)
          ? value
          : value &&
              ts.isJsxExpression(value) &&
              value.expression &&
              (ts.isStringLiteral(value.expression) ||
                ts.isNoSubstitutionTemplateLiteral(value.expression))
            ? value.expression
            : null
      if (READ_ATTRIBUTES.has(name) && literal) {
        if (hasLetter(literal.text) && !sameEverywhere(literal.text)) {
          add(literal, literal.text, 'attribute')
        }
        return
      }
      if (name === 'className' || name === 'key' || name === 'href' || name === 'src') return
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const word = /^\p{Lu}\p{Ll}+$/u.test(node.text) && !NAMES.test(node.text)
      if (readsLikeText(node.text) || (word && (shownAsText(node) || isValue(node))))
        add(node, node.text, 'string')
    } else if (ts.isTemplateExpression(node)) {
      // Values become "0", which has no letters.
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' 0 ')
      if (readsLikeText(parts)) add(node, parts, 'string')
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}
