// local: diffLayout. Disegna i blocchi ```diff (o ```patch) delle risposte con la versione vecchia a
// sinistra e la nuova a destra, riusando i colori, la sintassi e le parole cambiate delle diff card.
import type { ElementTable, RenderElement, RenderNode } from 'claude-code'

import { width } from './layout'
import type { Block } from './markdown'
import { CONTROL } from './markdown'
import type { DiffLine, DiffPaint, Drawn, Piece } from './render'
import { splitDiffKit as kit } from './render'
import type { Style } from './theme'

type Hunk = { oldStart: number; newStart: number; lines: string[] }

export type PatchFile = { path?: string; hunks: Hunk[] }

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

const sidePath = (spec: string): string => spec.replace(/\t.*$/, '').replace(/^"(.*)"$/, '$1').replace(/^[ab]\//, '')

// Testo di un diff unificato (git diff, diff -u) diviso per file. Una riga vuota dentro un blocco
// di modifica conta come contesto vuoto; le righe di intestazione (index, mode) chiudono il blocco.
export const parsePatch = (source: string[]): PatchFile[] => {
  const lines = source.map(line => line.replace(CONTROL, ''))
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  const files: PatchFile[] = []
  let file: PatchFile | undefined
  let hunk: Hunk | undefined
  const open = (): PatchFile => {
    file = { hunks: [] }
    files.push(file)
    hunk = undefined
    return file
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith('diff --git ')) {
      const to = / b\/(.+)$/.exec(line)
      open().path = to?.[1]
      continue
    }
    if (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
      const target = file && file.hunks.length === 0 ? file : open()
      const [from, to] = [sidePath(line.slice(4)), sidePath(lines[i + 1]!.slice(4))]
      target.path = to === '/dev/null' ? from : to
      hunk = undefined
      i++
      continue
    }
    const head = HUNK.exec(line)
    if (head) {
      hunk = { oldStart: Number(head[1]), newStart: Number(head[2]), lines: [] }
      ;(file ?? open()).hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    if (line === '') hunk.lines.push(' ')
    else if (line[0] === ' ' || line[0] === '+' || line[0] === '-' || line[0] === '\\') hunk.lines.push(line)
    else hunk = undefined
  }
  return files.filter(f => f.hunks.length > 0)
}

type Numbered = { rows: DiffLine[]; old: number[] }

// Le righe in ordine unificato, come le vogliono diffSegments e wordFlags; `old` tiene il numero
// della versione vecchia, che per le righe di contesto è diverso da `num` (quello della nuova).
const numbered = (file: PatchFile): Numbered => {
  const rows: DiffLine[] = []
  const old: number[] = []
  file.hunks.forEach((h, hunk) => {
    let [o, n] = [h.oldStart, h.newStart]
    for (const l of h.lines) {
      const text = l.slice(1)
      if (l[0] === '-') {
        rows.push({ mark: '-', num: o, text, hunk })
        old.push(o++)
      } else if (l[0] === '+') {
        rows.push({ mark: '+', num: n++, text, hunk })
        old.push(0)
      } else if (l[0] === ' ') {
        rows.push({ mark: ' ', num: n++, text, hunk })
        old.push(o++)
      }
    }
  })
  return { rows, old }
}

type Pair = { left: number | null; right: number | null; gap: boolean }

// Una riga di contesto sta sui due lati; una serie di righe tolte seguita da una serie di righe
// aggiunte si accoppia in ordine, e le righe in più restano con l'altro lato vuoto.
const pairsOf = (rows: DiffLine[]): Pair[] => {
  const pairs: Pair[] = []
  for (let i = 0; i < rows.length; ) {
    const gap = i > 0 && rows[i]!.hunk !== rows[i - 1]!.hunk
    if (rows[i]!.mark === ' ') {
      pairs.push({ left: i, right: i, gap })
      i++
      continue
    }
    const hunk = rows[i]!.hunk
    const removed: number[] = []
    const added: number[] = []
    while (i < rows.length && rows[i]!.hunk === hunk && rows[i]!.mark === '-') removed.push(i++)
    while (i < rows.length && rows[i]!.hunk === hunk && rows[i]!.mark === '+') added.push(i++)
    for (let k = 0; k < Math.max(removed.length, added.length); k++) pairs.push({ left: removed[k] ?? null, right: added[k] ?? null, gap: gap && k === 0 })
  }
  return pairs
}

const SEPARATOR = ' │ '
const CARD = 4
const TEXT_ROW = 2
// Con diffLayout auto il diff va affiancato solo se ogni lato ha almeno questo spazio per il codice.
export const AUTO_ROOM = 36
const SPLIT_ROOM = 12

type Geometry = { half: number; lead: number; room: number }

const geometry = (style: Style, paint: DiffPaint, columns: number): Geometry => {
  const frame = style.diffStyle === 'card' ? CARD : 0
  const half = Math.floor((columns - frame - width(SEPARATOR)) / 2)
  const lead = (paint.look === 'bar' ? 2 : 0) + paint.gutter + 3
  return { half, lead, room: half - lead }
}

const pieceWidth = (part: Piece[]): number => (part.length ? width(part.map(p => p.text).join('')) : 1)

const drawFile = (el: ElementTable, style: Style, file: PatchFile, columns: number, key: string, budget: { left: number }): RenderElement | null => {
  const { Box, Text } = el
  const { rows, old } = numbered(file)
  if (rows.length === 0) return null
  const paint = kit.diffPaint(style, String(Math.max(0, ...rows.map(r => r.num), ...old)).length)
  const { half, lead, room } = geometry(style, paint, columns)
  const segments = kit.diffSegments(style, rows, file.path)
  const flags = kit.wordFlags(rows, segments)
  const parts = rows.map((r, i) => {
    const rich = kit.visualRows(kit.tabbed(kit.wordPieces(segments[i]!, flags[i] ?? null)), room)
    return kit.spend(budget, kit.lineCost(rich, paint.look === 'bar', false, TEXT_ROW)) ? rich : kit.visualRows(kit.tabbed(kit.plainParts(r.text)[0]!), room)
  })
  const blank = (k: string, bg: string | undefined): RenderNode => <Text key={k} {...(bg ? { backgroundColor: bg } : {})}>{' '.repeat(half)}</Text>
  const side = (at: number | null, isOld: boolean, k: string): { cells: RenderNode[][]; bg: string | undefined } => {
    if (at === null) return { cells: [], bg: undefined }
    const r = isOld && rows[at]!.mark === ' ' ? { ...rows[at]!, num: old[at]! } : rows[at]!
    const bg = paint.tints[r.mark]
    const cells = parts[at]!.map((part, n) => {
      const pad = half - lead - pieceWidth(part)
      const drawn = kit.lineText(el, style, paint, r, `${k}.${n}`, n, part, pad)
      return bg || pad <= 0 ? drawn : [...drawn, <Text key={`${k}.${n}.p`}>{' '.repeat(pad)}</Text>]
    })
    return { cells, bg }
  }
  const pairs = pairsOf(rows)
  const shown = pairs.slice(0, kit.DIFF_MAX)
  const lines = shown.flatMap((pair, p) => {
    const left = side(pair.left, true, `${key}.l${p}`)
    const right = side(pair.right, false, `${key}.r${p}`)
    const height = Math.max(1, left.cells.length, right.cells.length)
    const drawn = Array.from({ length: height }, (_, n) => (
      <Box key={`${key}.p${p}.${n}`} flexDirection="row">
        {left.cells[n] ?? blank(`${key}.lb${p}.${n}`, left.bg)}
        <Text key={`${key}.s${p}.${n}`} color={style.theme.rule} dimColor>{SEPARATOR}</Text>
        {right.cells[n] ?? blank(`${key}.rb${p}.${n}`, right.bg)}
      </Box>
    ))
    return pair.gap ? [<Text key={`${key}.g${p}`} dimColor>...</Text>, ...drawn] : drawn
  })
  const marks = kit.markColors(style.theme)
  const added = rows.filter(r => r.mark === '+').length
  const removed = rows.filter(r => r.mark === '-').length
  const frame = style.diffStyle === 'card' ? { borderStyle: 'round' as const, borderColor: style.theme.rule, paddingX: 1 } : {}
  return (
    <Box key={key} flexDirection="column" alignSelf="flex-start" {...frame}>
      <Text key={`${key}.head`}>
        {file.path ? <Text color={style.theme.path}>{`${file.path} `}</Text> : null}
        <Text color={marks['+']} dimColor={added === 0}>{`+${added}`}</Text>
        <Text> </Text>
        <Text color={marks['-']} dimColor={removed === 0}>{`−${removed}`}</Text>
      </Text>
      {lines}
      {pairs.length > shown.length ? <Text key={`${key}.rest`} dimColor>{`… +${pairs.length - shown.length} lines`}</Text> : null}
    </Box>
  )
}

const isDiffLang = (lang: string | undefined): boolean => /^(diff|patch)$/i.test(lang?.trim() ?? '')

// Ogni lato deve avere spazio per il codice: con `split` basta poco, con `auto` serve AUTO_ROOM.
const fits = (style: Style, files: PatchFile[], columns: number): boolean => {
  const least = style.diffLayout === 'split' ? SPLIT_ROOM : AUTO_ROOM
  return files.every(file => {
    const { rows, old } = numbered(file)
    return geometry(style, kit.diffPaint(style, String(Math.max(0, ...rows.map(r => r.num), ...old)).length), columns).room >= least
  })
}

export const drawDiffs = (el: ElementTable, style: Style, blocks: Block[], columns: number, drawn: Drawn = new Map()): Drawn => {
  if (style.diffLayout === undefined || style.diffLayout === 'unified') return drawn
  const budget = { left: kit.DIFF_EXTRA }
  for (const [i, block] of blocks.entries()) {
    if (drawn.has(i) || block.kind !== 'code' || !isDiffLang(block.lang)) continue
    const files = parsePatch(block.lines)
    if (files.length === 0 || !fits(style, files, columns)) continue
    const cards = files.map((file, f) => drawFile(el, style, file, columns, `ds${i}.f${f}`, budget)).filter((card): card is RenderElement => card !== null)
    if (cards.length) drawn.set(i, { element: <el.Box key={`b${i}`} flexDirection="column" rowGap={1}>{cards}</el.Box> })
  }
  return drawn
}
