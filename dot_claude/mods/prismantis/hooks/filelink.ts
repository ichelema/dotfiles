// local: percorsi dei file cliccabili (vedi UPSTREAM).
// Un `code` o un path che porta a un file o a una cartella esistente riceve un href
// vscode://file/<assoluto>[:riga[:colonna]], l'unico schema di file che Claude Code accetta nei link.
// Il testo resta quello scritto; in WezTerm CTRL+clic lo apre in Neovim (utils/open-file.lua).
import type { Block, Inline } from './markdown'

type Fs = { exists: (path: string) => Promise<boolean> }
export type FileTarget = { path: string; line?: string; col?: string }

const SPOT = /^(.+?)(?::(\d+)(?::(\d+))?)?$/
const NOT_A_PATH = /[\s"'<>|*?$`(){}[\]]/

const slash = (p: string) => p.replace(/\\/g, '/')

/** Percorso assoluto (barre in avanti) con riga e colonna, o undefined se il testo non sembra un percorso. */
export const fileTarget = (text: string, cwd: string, home: string): FileTarget | undefined => {
  if (text.length > 300 || NOT_A_PATH.test(text) || !/[./\\]/.test(text)) return undefined
  const m = SPOT.exec(text)
  if (!m) return undefined
  const win = /^[A-Za-z]:[\\/]/.test(cwd)
  // MSYS2: /e/AI -> E:/AI (solo su Windows)
  const native = (p: string) => (win ? slash(p).replace(/^\/([A-Za-z])(?=\/|$)/, (_, d: string) => `${d.toUpperCase()}:`) : slash(p))
  let p = native(m[1]!)
  if (p === '~' || p.startsWith('~/')) p = native(home).replace(/\/$/, '') + p.slice(1)
  if (!(win ? /^[A-Za-z]:\//.test(p) : p.startsWith('/'))) {
    if (win && p.startsWith('/')) return undefined // /tmp, /ucrt64: radice MSYS2 sconosciuta da qui
    p = `${native(cwd).replace(/\/$/, '')}/${p}`
  }
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '.') continue
    if (seg === '..') {
      if (parts.length > 1) parts.pop()
      continue
    }
    parts.push(seg)
  }
  return { path: parts.join('/'), line: m[2], col: m[3] }
}

export const fileHref = (t: FileTarget): string =>
  `vscode://file${t.path.startsWith('/') ? '' : '/'}${encodeURI(t.path)}${t.line ? `:${t.line}${t.col ? `:${t.col}` : ''}` : ''}`

const texts = (nodes: Inline[], out: Set<string>) => {
  for (const n of nodes) {
    if (n.kind === 'code' || n.kind === 'path') out.add(n.text)
    else if ('children' in n) texts(n.children, out)
  }
}

const blockTexts = (block: Block, out: Set<string>) => {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return texts(block.inline, out)
    case 'list':
      return block.items.forEach(item => {
        texts(item.inline, out)
        item.blocks?.forEach(b => blockTexts(b, out))
      })
    case 'table':
      return [...block.header, ...block.rows.flat()].forEach(cell => texts(cell, out))
    case 'notes':
      return block.notes.forEach(note => texts(note.inline, out))
    case 'quote':
    case 'alert':
      return block.blocks.forEach(b => blockTexts(b, out))
  }
}

// ponytail: anche le risposte negative restano in cache fino al prossimo prompt (forgetFiles)
const seen = new Map<string, Promise<boolean>>()
const exists = (fs: Fs, path: string): Promise<boolean> => {
  let found = seen.get(path)
  if (!found) {
    found = fs.exists(path).catch(() => false)
    if (seen.size > 5000) seen.clear()
    seen.set(path, found)
  }
  return found
}

export const forgetFiles = () => seen.clear()

/** Testo del `code`/path -> href, solo per i file che esistono. */
export const fileLinks = async (fs: Fs, blocks: Block[], cwd: string, home: string): Promise<Map<string, string>> => {
  const found = new Set<string>()
  blocks.forEach(b => blockTexts(b, found))
  const links = new Map<string, string>()
  await Promise.all(
    [...found].map(async text => {
      const t = fileTarget(text, cwd, home)
      if (t && (await exists(fs, t.path))) links.set(text, fileHref(t))
    }),
  )
  return links
}
