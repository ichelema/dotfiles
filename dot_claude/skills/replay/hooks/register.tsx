import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'

const PANE = 'replay'
const steps = atom({ plugin: 'replay', key: 'steps' } as const, [])
const at = atom({ plugin: 'replay', key: 'at' } as const, 0)
const isHidden = atom({ plugin: 'replay', key: 'isHidden' } as const, false)

// The dock's share of the terminal; $.ui.open takes columns, so it is turned
// into a count from the last width the band was drawn at.
const PANE_SHARE = 0.6
const PANE_BG = '#0D1721'
let terminalColumns: number | undefined

const openReplay = async ($: EngineInterface) => {
  if ((await read($, steps)).length === 0) return false
  await update($, at, () => 0)
  await update($, isHidden, () => true)
  const columns = terminalColumns && Math.round(terminalColumns * PANE_SHARE)
  await $.ui.open({ id: PANE, title: 'Replay', ...(columns ? { columns } : {}) })

  return true
}

type Row = { left?: string; right?: string; isSame: boolean }

const linesOf = (s: string) => (s === '' ? [] : s.split('\n'))

// ponytail: O(n·m) LCS, fine for an edit hunk; switch to Myers if big Write replays lag
const sideBySide = (a: string[], b: string[]): Row[] => {
  const L = a.map(() => new Array<number>(b.length + 1).fill(0))
  L.push(new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)

  const rows: Row[] = []
  let del: string[] = []
  let add: string[] = []
  const flush = () => {
    for (let k = 0; k < Math.max(del.length, add.length); k++)
      rows.push({ left: del[k], right: add[k], isSame: false })
    del = []
    add = []
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      rows.push({ left: a[i++], right: b[j++], isSame: true })
    } else if (j < b.length && (i === a.length || L[i]![j + 1]! >= L[i + 1]![j]!)) add.push(b[j++]!)
    else del.push(a[i++]!)
  }
  flush()

  return rows
}

// "Edit +3 −1": the tool and the lines it added and removed. A step kept
// from before `kind` was recorded shows no tool.
const summary = (s: Step) => {
  const rows = sideBySide(linesOf(s.before), linesOf(s.after)).filter(r => !r.isSame)
  const added = rows.filter(r => r.right !== undefined).length
  const removed = rows.filter(r => r.left !== undefined).length

  return `${s.kind ?? ''} +${added} −${removed}`.trim()
}

type Style = { color?: string; backgroundColor?: string; bold?: boolean; dimColor?: boolean }
type Span = Style & { text: string }

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`

const BASIC = [
  '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
  '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff',
]

// The xterm 256-colour palette as #rrggbb.
const xterm = (n: number): string => {
  if (n < 16) return BASIC[n]!
  if (n < 232) {
    const v = [0, 95, 135, 175, 215, 255]
    const c = n - 16
    return hex(v[Math.floor(c / 36)]!, v[Math.floor(c / 6) % 6]!, v[c % 6]!)
  }
  const g = 8 + (n - 232) * 10
  return hex(g, g, g)
}

// ponytail: SGR colors/bold/dim only; other escapes (OSC 8 links) dropped
const parseAnsi = (line: string): Span[] => {
  const spans: Span[] = []
  let style: Style = {}
  line
    .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
    .split(/\x1b\[([\d;]*)m/)
    .forEach((p, i) => {
      if (i % 2 === 0) {
        if (p) spans.push({ text: p, ...style })
        return
      }
      const c = p === '' ? [0] : p.split(';').map(Number)
      for (let k = 0; k < c.length; k++) {
        const n = c[k]!
        if (n === 0) style = {}
        else if (n === 1) style.bold = true
        else if (n === 2) style.dimColor = true
        else if (n === 22) style = { ...style, bold: undefined, dimColor: undefined }
        else if (n === 38 || n === 48) {
          const key = n === 38 ? 'color' : 'backgroundColor'
          if (c[k + 1] === 5) {
            style[key] = xterm(c[k + 2]!)
            k += 2
          } else if (c[k + 1] === 2) {
            style[key] = hex(c[k + 2]!, c[k + 3]!, c[k + 4]!)
            k += 4
          }
        } else if (n === 39) style.color = undefined
        else if (n === 49) style.backgroundColor = undefined
        else if (n >= 30 && n <= 37) style.color = xterm(n - 30)
        else if (n >= 90 && n <= 97) style.color = xterm(n - 82)
        else if (n >= 40 && n <= 47) style.backgroundColor = xterm(n - 40)
        else if (n >= 100 && n <= 107) style.backgroundColor = xterm(n - 92)
      }
    })

  return spans.map(s =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Span,
  )
}

// One delta run per step and width; a failure (delta missing, tests) answers null.
let deltaCache: { id: string; lines: Span[][] | null } = { id: '', lines: null }

const deltaLines = async ($: EngineInterface, step: Step, width: number) => {
  const id = JSON.stringify([step, width])
  if (deltaCache.id === id) return deltaCache.lines

  let lines: Span[][] | null = null
  try {
    const tmp = (await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '/tmp'
    const ext = step.file.match(/\.[^./\\]+$/)?.[0] ?? '.txt'
    const a = `${tmp}/claude-replay/before${ext}`
    const b = `${tmp}/claude-replay/after${ext}`
    // An Edit's strings are fragments: without a final newline diff adds "\ No newline at end of file"
    const eol = (s: string) => (s === '' || s.endsWith('\n') ? s : `${s}\n`)
    await $.fs.write(a, eol(step.before))
    await $.fs.write(b, eol(step.after))
    const ran = await $.process.run([
      'delta', '--paging=never', '--side-by-side', `--width=${width}`, '--true-color=always',
      '--file-style=omit', '--hunk-header-style=omit', a, b,
    ])
    // delta exits 1 when the files differ, as diff does
    if (ran.exitCode <= 1 && ran.stdout.trim()) lines = ran.stdout.trimEnd().split('\n').map(parseAnsi)
  } catch {
    lines = null
  }
  deltaCache = { id, lines }

  return lines
}

export const register: Register = on => {
  // The edits of the running main turn; published to $.state when it ends.
  let pending: Step[] = []

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Edit' && e.tool !== 'Write') return next(e)

    const file = e.file_path
    const before =
      e.tool === 'Edit' ? e.old_string : await $.fs.read(file).catch(() => '')
    const after = e.tool === 'Edit' ? e.new_string : e.content
    const ran = await next(e)
    if (!ran.deny && !ran.isError) pending.push({ file, kind: e.tool, before, after })

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && pending.length > 0) {
      const done = pending
      pending = []
      await update($, steps, () => done)
      await update($, at, () => 0)
      await update($, isHidden, () => false)
    }

    return r
  })

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'replay',
      description: "Step through the last turn's file edits",
    })

    return r
  })

  on('command.run', { command: 'replay' }, async $ => ({
    text: (await openReplay($)) ? 'Replaying' : 'No edits',
  }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    terminalColumns = e.viewport?.columns ?? terminalColumns
    const list = await read($, steps)
    const isQuiet =
      e.props.hasSurvey ||
      e.props.isWorking ||
      list.length === 0 ||
      (await read($, isHidden))
    if (isQuiet) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          {list.length} edit{list.length === 1 ? '' : 's'} in the last turn{' '}
        </Text>
        <Button key="replay" label="Replay" hotkey="r" onPress={() => openReplay($)} />
        <Button key="hide" label="Hide" hotkey="h" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, steps)
    const i = Math.min(await read($, at), Math.max(0, list.length - 1))
    const step = list[i]
    if (!step) return <Text dimColor>No edits to replay.</Text>

    // The step list above the diff takes one row per step.
    const room = Math.max(4, (e.viewport?.rows ?? 24) - 7 - list.length)
    const half = Math.max(10, Math.floor((e.props.bodyColumns - 3) / 2))
    const delta = await deltaLines($, step, e.props.bodyColumns)
    const rows = delta ? [] : sideBySide(linesOf(step.before), linesOf(step.after)).slice(0, room)

    return (
      <Box flexDirection="column" minHeight={e.props.scroll.bodyRows} backgroundColor={PANE_BG}>
        {list.map((s, k) => (
          <Button
            key={`step:${k}`}
            plain
            label={`${k === i ? '▶' : ' '} ${k + 1}. ${s.file.split(/[\\/]/).pop()}  ${summary(s)}`}
            dimColor={k !== i}
            onPress={() => update($, at, () => k)}
          />
        ))}
        <Text> </Text>
        <Text bold wrap="truncate-start">
          {i + 1}/{list.length} {step.file}
        </Text>
        {delta?.slice(0, room).map(spans => (
          <Text wrap="truncate">
            {spans.length === 0 ? ' ' : spans.map(({ text, ...style }) => <Text {...style}>{text}</Text>)}
          </Text>
        ))}
        {rows.map(r => (
          <Box>
            <Box width={half}>
              <Text {...(r.isSame ? { dimColor: true } : { color: 'red' })} wrap="truncate">
                {r.left ?? ' '}
              </Text>
            </Box>
            <Text dimColor> │ </Text>
            <Box width={half}>
              <Text {...(r.isSame ? { dimColor: true } : { color: 'green' })} wrap="truncate">
                {r.right ?? ' '}
              </Text>
            </Box>
          </Box>
        ))}
        <Box>
          <Button key="prev" label="Prev" hotkey="p" onPress={() => update($, at, n => Math.max(0, n - 1))} />
          {i < list.length - 1 && (
            <Button key="next" label="Next" hotkey="n" onPress={() => update($, at, n => Math.min(list.length - 1, n + 1))} />
          )}
        </Box>
      </Box>
    )
  })
}
