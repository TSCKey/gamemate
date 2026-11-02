// A small reader for GameMate's own legal documents (docs/TERMS.md and docs/PRIVACY.md): headings,
// paragraphs, lists, tables, bold text and links. They are turned into React elements, never HTML.

export interface Inline {
  text: string
  bold?: boolean
  href?: string
}

export type Block =
  | { type: 'heading'; level: number; text: Inline[] }
  | { type: 'paragraph'; text: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], href: m[3] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.replace(/\r/g, '').split('\n')
  let paragraph: string[] = []
  const flush = (): void => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: parseInline(paragraph.join(' ')) })
    paragraph = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flush()
    } else if (heading) {
      flush()
      blocks.push({ type: 'heading', level: heading[1].length, text: parseInline(heading[2]) })
    } else if (/^\s*-\s+/.test(line)) {
      flush()
      const items: Inline[][] = []
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*-\s+/, '')))
        i++
      }
      i--
      blocks.push({ type: 'list', items })
    } else if (line.trim().startsWith('|')) {
      flush()
      const rows: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++])
      i--
      const [header, , ...body] = rows
      blocks.push({
        type: 'table',
        header: cells(header).map(parseInline),
        rows: body.map((row) => cells(row).map(parseInline))
      })
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}
