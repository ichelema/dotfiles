// local: test delle patch locali (vedi UPSTREAM). Rilancia con `claude plugin test` dopo ogni update upstream.
import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { FIGURE_HINT } from '../hooks/figure'
import { HINT } from '../hooks/help'
import { fileHref, fileTarget } from '../hooks/filelink'

const call = (tool: string, input: unknown, id: string, isErrored = false) => ({ tool_use_id: id, tool, input, isRunning: false, isErrored, isInterrupted: false })
const toolResult = (tool: string, output: unknown, id: string, isErrored = false) =>
  ({ plugin: 'prismantis', surface: 'terminal' as const, component: 'ToolResult' as const, props: { tool_use_id: id, tool, output, isErrored } })
// Claude Code's own drawing, for what prismantis hands on with next.
const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
const patch = { filePath: '/tmp/app.ts', structuredPatch: [{ oldStart: 4, newStart: 4, lines: [' const a = 1', '-const b = 2', '+const b = 3', '+const c = 4'] }] }

test('folded: a tool result stays closed until its toggle is pressed', { options: { toolStyle: 'folded' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(toolResult('Bash', { stdout: 'hello' }, 'f-1'))
  expect(await ui.find({ type: 'Text', text: /^▸ output$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeUndefined()
  await ui.press({ key: 'result-fold' })
  expect(await ui.find({ type: 'Text', text: /^▾ output$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await ui.unmount()
})

test('folded: an Edit diff card is folded too, and opens to the upstream card', { options: { toolStyle: 'folded' } }, async $ => {
  const ui = await $.ui.mount(toolResult('Edit', patch, 'f-2'))
  expect(await ui.find({ type: 'Text', text: /^\+2$/ })).toBeUndefined()
  await ui.press({ key: 'result-fold' })
  expect(await ui.find({ type: 'Text', text: /^\+2$/ })).toBeDefined()
  await ui.unmount()
})

test('folded: a failed result toggle is red', { options: { toolStyle: 'folded' } }, async $ => {
  const ui = await $.ui.mount(toolResult('Bash', 'Exit code 1\nboom', 'f-3', true))
  expect((await ui.find({ type: 'Text', text: /^▸ error$/ }))?.props.color).toBe('red')
  await ui.unmount()
})

test('folded: a failed tool row draws its name in red, a group counts calls per kind', { options: { toolStyle: 'folded' } }, async $ => {
  const row = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolUse', props: call('Bash', { command: 'make' }, 'f-4', true) })
  expect((await row.find({ type: 'Text', text: /^Bash$/ }))?.props.color).toBe('red')
  await row.unmount()
  const group = await $.ui.mount({
    plugin: 'prismantis',
    surface: 'terminal',
    component: 'ToolGroup',
    props: { calls: [call('Read', { file_path: '/tmp/a' }, 'g-1'), call('Read', { file_path: '/tmp/b' }, 'g-2'), call('Grep', { pattern: 'x' }, 'g-3')], isActive: false, isExpanded: false },
  })
  expect(await group.find({ type: 'Text', text: /^Read$/ })).toBeDefined()
  expect(await group.find({ type: 'Text', text: /^ 2$/ })).toBeDefined()
  expect(await group.find({ type: 'Text', text: /^Search$/ })).toBeDefined()
  await group.unmount()
})

test('folded: an expanded shell call that failed shows its error text in red', { options: { toolStyle: 'folded' } }, async ($, on) => {
  engine(on)
  const failed = { ...call('Bash', { command: 'make' }, 'f-5', true), output: 'Exit code 2\nmake: *** No rule' }
  const group = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolGroup', props: { calls: [failed], isActive: false, isExpanded: true } })
  await group.unmount()
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolUse', props: failed })
  expect((await ui.find({ type: 'Text', text: /^make: \*\*\* No rule$/ }))?.props.color).toBe('red')
  await ui.unmount()
})

test('framed: the prompt draws in a square box with the mascot', { options: { promptStyle: 'framed' } }, async $ => {
  const ui = await $.ui.mount({ plugin: 'prismantis', component: 'UserMessage', props: { text: 'ciao', origin: { kind: 'composer' } as never, isExpanded: true }, viewport: { columns: 80, rows: 10 }, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'single')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^⠀⡖⣶⣶⢲⠀$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ciao/ })).toBeDefined()
  await ui.unmount()
})

test('bubble: the prompt bubble takes the full width', async $ => {
  const ui = await $.ui.mount({ plugin: 'prismantis', component: 'UserMessage', props: { text: 'ciao', origin: { kind: 'composer' } as never, isExpanded: true }, viewport: { columns: 80, rows: 10 }, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Box' })).find(b => b.props.borderStyle === 'round')?.props.width).toBe('100%')
  await ui.unmount()
})

test('diagramHints: the hint goes with the first prompt only', async ($, on) => {
  const seen: (readonly string[] | undefined)[] = []
  mock.env(on, {})
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text, context: e.context }
  })
  await $.prompt.submit({ text: 'one', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: 'two', wait: false, origin: { kind: 'composer' } })
  expect(seen).toHaveLength(2)
  expect(seen[0]).toContain(HINT)
  expect(seen[0]).toContain(FIGURE_HINT)
  expect(seen[1] ?? []).not.toContain(HINT)
  expect(seen[1] ?? []).not.toContain(FIGURE_HINT)
})

test('lists get no copy button', async $ => {
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'AssistantMessage', props: { text: '- one\n- two', isFirstOfReply: true }, viewport: { columns: 80, rows: 20 } })
  const labels = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
  expect(labels).not.toContain('⧉ copy')
  await ui.unmount()
})

// local: percorsi cliccabili (hooks/filelink.ts)
test('filelink: fileTarget rende assoluto il percorso, con riga e colonna', async () => {
  const win = 'E:\\AI\\proj'
  expect(fileTarget('utils/x.lua:12', win, '/e/msys64/home/me')).toEqual({ path: 'E:/AI/proj/utils/x.lua', line: '12', col: undefined })
  expect(fileTarget('C:\\APPL\\w.lua:5:3', win, '')).toEqual({ path: 'C:/APPL/w.lua', line: '5', col: '3' })
  expect(fileTarget('/e/AI/x.lua', win, '')?.path).toBe('E:/AI/x.lua')
  expect(fileTarget('~/.zshrc', win, '/e/msys64/home/me')?.path).toBe('E:/msys64/home/me/.zshrc')
  expect(fileTarget('../a/./b.md', win, '')?.path).toBe('E:/AI/a/b.md')
  expect(fileTarget('/tmp/x.log', win, '')).toBeUndefined()
  expect(fileTarget('/home/me/x.ts:4', '/srv/app', '/home/me')).toEqual({ path: '/home/me/x.ts', line: '4', col: undefined })
  expect(fileTarget('git status', win, '')).toBeUndefined()
  expect(fileTarget('foo', win, '')).toBeUndefined()
  expect(fileHref({ path: 'E:/my dir/x.lua', line: '7' })).toBe('vscode://file/E:/my%20dir/x.lua:7')
  expect(fileHref({ path: '/home/me/x.ts' })).toBe('vscode://file/home/me/x.ts')
})

const filelinkText = '| File | Nota |\n|---|---|\n| `utils/open-file.lua:12` | apre |\n| `vim.lsp.enable` | no |'

test('filelink: senza FORCE_HYPERLINK=1 nessun link ai file (Claude Code scriverebbe "testo URL")', async ($, on) => {
  mock.env(on, {})
  on('session.version', () => ({ value: { version: '2.1.302', base: '2.1.302' } }))
  on('session.cwd', () => ({ value: 'E:\\AI\\proj' }))
  on('fs.exists', () => ({ value: true }))
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'AssistantMessage', props: { text: filelinkText, isFirstOfReply: true }, viewport: { columns: 60, rows: 20 } })
  expect(await ui.findAll({ type: 'Link' })).toHaveLength(0)
  await ui.unmount()
})

test('filelink: in una tabella un `code` che porta a un file esistente diventa un link, gli altri no', async ($, on) => {
  mock.env(on, { FORCE_HYPERLINK: '1' })
  on('session.version', () => ({ value: { version: '2.1.302', base: '2.1.302' } }))
  on('session.cwd', () => ({ value: 'E:\\AI\\proj' }))
  // l'ambiente passa il percorso nativo (E:\AI\...)
  on('fs.exists', (_$, e) => ({ value: e.path.replace(/\\/g, '/') === 'E:/AI/proj/utils/open-file.lua' }))
  // 24 colonne: la cella del percorso va a capo, ogni pezzo resta un link
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'AssistantMessage', props: { text: filelinkText, isFirstOfReply: true }, viewport: { columns: 24, rows: 20 } })
  const hrefs = (await ui.findAll({ type: 'Link' })).map(l => l.props.href)
  expect(hrefs.length).toBeGreaterThan(1)
  expect(hrefs.every(h => h === 'vscode://file/E:/AI/proj/utils/open-file.lua:12')).toBe(true)
  await ui.unmount()
})
