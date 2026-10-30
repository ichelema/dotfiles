// local: test delle patch locali (vedi UPSTREAM). Rilancia con `claude plugin test` dopo ogni update upstream.
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { FIGURE_HINT } from '../hooks/figure'
import { HINT, ISSUE_HINT, setupParts, setupText } from '../hooks/help'
import { fileHref, fileTarget } from '../hooks/filelink'
import { PRESET_NAMES } from '../hooks/presets'
import { width } from '../hooks/render'
import { resolveStyle } from '../hooks/theme'

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

test('folded con quiet: l\'output Bash di un gruppo resta chiuso finché il clic non lo apre', { options: { toolStyle: 'folded', toolOutput: 'quiet' } }, async $ => {
  const ran = { ...call('Bash', { command: 'make' }, 'q-1'), output: { stdout: 'built', stderr: '' } }
  const group = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolGroup', props: { calls: [call('Read', { file_path: '/tmp/a' }, 'q-0'), ran], isActive: false, isExpanded: false } })
  expect(await group.find({ type: 'Text', text: /^▸ output$/ })).toBeDefined()
  expect(await group.find({ type: 'Text', text: /^built$/ })).toBeUndefined()
  await group.press({ key: 'result-fold' })
  expect(await group.find({ type: 'Text', text: /^▾ output$/ })).toBeDefined()
  expect(await group.find({ type: 'Text', text: /^built$/ })).toBeDefined()
  await group.unmount()
})

test('hide: riga, gruppo e risultato di un tool non disegnano niente; con ctrl+o passano al disegno normale', { options: { toolStyle: 'hide' } }, async ($, on) => {
  engine(on)
  const failed = call('Bash', { command: 'make' }, 'h-1', true)
  const row = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolUse', props: failed })
  expect(await row.find({ type: 'Text' })).toBeUndefined()
  await row.unmount()
  const group = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolGroup', props: { calls: [call('Read', { file_path: '/tmp/a' }, 'h-2'), { ...call('Bash', { command: 'make' }, 'h-3'), output: { stdout: 'built', stderr: '' } }], isActive: false, isExpanded: false } })
  expect(await group.find({ type: 'Text' })).toBeUndefined()
  await group.unmount()
  for (const result of [toolResult('Bash', { stdout: 'built' }, 'h-4'), toolResult('Edit', patch, 'h-5'), toolResult('Bash', 'Exit code 1', 'h-6', true)]) {
    const ui = await $.ui.mount(result)
    expect(await ui.find({ type: 'Text' })).toBeUndefined()
    await ui.unmount()
  }
  const expanded = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolGroup', props: { calls: [failed], isActive: false, isExpanded: true } })
  expect(await expanded.find({ type: 'Text', text: /^engine$/ })).toBeDefined()
  await expanded.unmount()
})

test('framed: the prompt draws in a square box with the mascot', { options: { promptStyle: 'framed' } }, async $ => {
  const ui = await $.ui.mount({ plugin: 'prismantis', component: 'UserMessage', props: { text: 'ciao', origin: { kind: 'composer' } as never, isExpanded: true }, viewport: { columns: 80, rows: 10 }, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'single')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^⠀⡖⣶⣶⢲⠀$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /ciao/ })).toBeDefined()
  await ui.unmount()
})

// local: versione del test upstream "/prismantis setup draws each sample in its own style" con framed e folded
test('setup: framed and folded are steps too, each sample drawn in its own style', async $ => {
  const mount = async (at: number) =>
    $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'CommandOutput', props: { command: 'prismantis', args: 'setup', text: `Tables set to box.\n\n${setupText(setupParts(PRESET_NAMES, at))}`, isErrored: false }, viewport: { columns: 100, rows: 40 } })
  const prompts = await mount(5)
  expect(setupParts(PRESET_NAMES, 5).options.map(o => o.value)).toEqual(['bubble', 'wide', 'bar', 'chevron', 'off', 'framed'])
  expect(await prompts.findAll({ type: 'Text', text: /fix the failing test/ })).toHaveLength(6)
  expect(await prompts.find({ type: 'Text', text: /^⠀⡖⣶⣶⢲⠀$/ })).toBeTruthy()
  await prompts.unmount()
  const tools = await mount(8)
  expect(setupParts(PRESET_NAMES, 8).options.map(o => o.value)).toEqual(['chat', 'tree-dim', 'tree-bold', 'classic', 'folded', 'hide'])
  expect(await tools.find({ type: 'Text', text: /⎿/ })).toBeTruthy()
  expect(await tools.findAll({ type: 'Text', text: /^Read$/ })).toHaveLength(5)
  await tools.unmount()
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

// local: issueHint è tolto per scelta e non va reimplementato. Se un merge futuro lo rimette, questi test falliscono
const contextsOf = async ($: Engine, on: On, prompts: number) => {
  const seen: (readonly string[] | undefined)[] = []
  mock.env(on, {})
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text, context: e.context }
  })
  for (let i = 0; i < prompts; i++) await $.prompt.submit({ text: `p${i}`, wait: false, origin: { kind: 'composer' } })
  return seen
}

test('issueHint: tolto, ISSUE_HINT non arriva mai al modello e le note dei diagrammi vanno una volta', async ($, on) => {
  const seen = await contextsOf($, on, 21)
  expect(seen).toHaveLength(21)
  expect(seen[0]).toEqual(expect.arrayContaining([HINT, FIGURE_HINT]))
  expect(seen.some(context => context?.includes(ISSUE_HINT))).toBe(false)
  for (const context of seen.slice(1)) expect(context ?? []).toEqual([])
  expect(resolveStyle({}).issueHint).toBe(false)
})

test('issueHint: tolto, anche con diagramHints spento nessuna nota arriva al modello', { options: { diagramHints: false } }, async ($, on) => {
  const seen = await contextsOf($, on, 11)
  expect(seen).toHaveLength(11)
  for (const context of seen) expect(context ?? []).toEqual([])
})

test('lists get no copy button', async $ => {
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'AssistantMessage', props: { text: '- one\n- two', isFirstOfReply: true }, viewport: { columns: 80, rows: 20 } })
  const labels = (await ui.findAll({ type: 'Button' })).map(b => b.props.label)
  expect(labels).not.toContain('⧉ copy')
  await ui.unmount()
})

// local: versione dei due test upstream "copyButtonStyle hover …" senza il bottone delle liste
const hoverMount = (text: string) => ({ plugin: 'prismantis', surface: 'terminal' as const, component: 'AssistantMessage' as const, props: { text, isFirstOfReply: true }, viewport: { columns: 120, rows: 40 } })
type FloatNode = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
const floatKids = (node: FloatNode) => (node.children ?? []).filter((child): child is FloatNode => !!child && typeof child === 'object')
const floatLabels = (node: FloatNode): string[] => (node.type === 'Button' ? [String(node.props?.label)] : floatKids(node).flatMap(floatLabels))
const floatRoom = (node: FloatNode, room = 0): { labels: string[]; needs: number; room: number }[] => {
  if (node.props?.position === 'absolute' && node.props.display === 'none') {
    const labels = floatLabels(node)
    return [{ labels, needs: labels.reduce((w, label) => w + (w ? 1 : 0) + width(`[ ${label} ]`), 0), room }]
  }
  const here = typeof node.props?.minWidth === 'number' ? node.props.minWidth : room
  return floatKids(node).flatMap(child => floatRoom(child, here))
}

test('lists get no copy button: hover reserves every other floating button\'s width', { options: { copyButtonStyle: 'hover' } }, async $ => {
  const ui = await $.ui.mount(hoverMount('| a |\n|---|\n| 1 |\n\n```\nx\n```\n\n- y\n\n> z\n\n> [!NOTE]\n> w\n\n> ```\n> q\n> ```\n\n- item\n  ```\n  v\n  ```\n\n```mermaid\nflowchart LR\n  A --> B\n```'))
  const floats = floatRoom((await ui.drawn()) as FloatNode).filter(f => !f.labels.includes('⧉ copy reply'))
  expect(floats.length).toBe(8)
  for (const float of floats) expect({ ...float, fits: float.room >= float.needs }).toMatchObject({ fits: true })
  await ui.unmount()
})

test('lists get no copy button: hover anchors right-to-left quotes, alerts and tables at the left', { options: { copyButtonStyle: 'hover', rtl: 'warp' } }, async $ => {
  const anchors = async (text: string) => {
    const ui = await $.ui.mount(hoverMount(text))
    const floats = (await ui.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute' && b.props.display === 'none' && b.text !== '⧉ copy reply')
    await ui.unmount()
    return floats.map(b => (b.props.left === 0 && b.props.right === undefined ? 'left' : b.props.right === 0 && b.props.left === undefined ? 'right' : 'both'))
  }
  expect(await anchors('- שלום עולם\n- עוד פריט')).toEqual([])
  expect(await anchors('> שלום עולם')).toEqual(['left'])
  expect(await anchors('> [!NOTE]\n> שלום עולם')).toEqual(['left'])
  expect(await anchors('| שם | ערך |\n|---|---|\n| אחד | שתיים |')).toEqual(['left'])
  expect(await anchors('> hello')).toEqual(['right'])
})

// local: versione dei test upstream "copyButtonStyle hover gives every block with copy buttons one dim ⧉ …"
// e "copyButtonStyle hover puts the ⧉ of a right-to-left block at its left …" senza il bottone delle liste
type MarkNode = FloatNode & { hover?: { scope?: string } }
const withParents = (node: MarkNode, parent?: MarkNode): { node: MarkNode; parent?: MarkNode }[] => [{ node, parent }, ...floatKids(node).flatMap(child => withParents(child, node))]
const shownText = (node: FloatNode): string => (node.children ?? []).map(child => (typeof child === 'string' ? child : child && typeof child === 'object' ? shownText(child as FloatNode) : '')).join('')

for (const surface of ['terminal', 'desktop'] as const) test(`lists get no copy button: hover gives every other block one dim ⧉ in the flow, the list none, on ${surface}`, { options: { copyButtonStyle: 'hover' } }, async $ => {
  const ui = await $.ui.mount({ ...hoverMount('| a |\n|---|\n| 1 |\n\n```\nx\n```\n\n- y\n\n> z\n\n> [!NOTE]\n> w\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nplain'), surface })
  const marks = withParents((await ui.drawn()) as MarkNode).filter(({ node }) => node.type === 'Text' && shownText(node) === '⧉')
  expect(marks).toHaveLength(6)
  for (const { node } of marks) expect(node.props?.dimColor).toBe(true)
  const blocks = marks.map(({ parent }) => parent!).filter(box => !box.hover?.scope?.endsWith(':reply'))
  expect(blocks).toHaveLength(5)
  for (const box of blocks) expect({ scoped: box.hover?.scope !== undefined, flows: box.props?.position !== 'absolute' }).toEqual({ scoped: true, flows: true })
  expect(await ui.find({ key: 'c2' })).toBeUndefined()
  for (const key of ['c0', 'c3', 'c4', 'c5']) expect(((await ui.find({ key }))?.children[0] as FloatNode).props?.columnGap).toBe(1)
  await ui.unmount()
})

test('lists get no copy button: hover puts the ⧉ of right-to-left quotes, alerts and tables at the left', { options: { copyButtonStyle: 'hover', rtl: 'warp' } }, async $ => {
  const side = async (text: string) => {
    const ui = await $.ui.mount(hoverMount(text))
    const row = (await ui.find({ key: 'c0' }))?.children[0] as FloatNode | undefined
    const flow = row ? floatKids(row).filter(child => child.props?.position !== 'absolute') : []
    const marked = (child?: FloatNode) => !!(child as MarkNode | undefined)?.hover?.scope
    await ui.unmount()
    return marked(flow[0]) ? 'left' : marked(flow.at(-1)) ? 'right' : 'none'
  }
  expect(await side('- שלום עולם\n- עוד פריט')).toBe('none')
  expect(await side('> שלום עולם')).toBe('left')
  expect(await side('> [!NOTE]\n> שלום עולם')).toBe('left')
  expect(await side('| שם | ערך |\n|---|---|\n| אחד | שתיים |')).toBe('left')
  expect(await side('> hello שלום')).toBe('right')
  expect(await side('> hello')).toBe('right')
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
  // la tabella la disegna prismantis (bottone copy), non il renderer di Claude Code
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.label)).toContain('⧉ md')
  await ui.unmount()
})

test('filelink: in una tabella un `code` che porta a un file esistente diventa un link, gli altri no', async ($, on) => {
  mock.env(on, { FORCE_HYPERLINK: '1' })
  on('session.version', () => ({ value: { version: '2.1.302', base: '2.1.302' } }))
  on('session.cwd', () => ({ value: 'E:\\AI\\proj' }))
  // l'ambiente passa il percorso nativo: E:\AI\... su Windows; su Linux E:/AI/... è relativo e arriva
  // dopo la cartella corrente. Conta solo che chieda quel file
  on('fs.exists', (_$, e) => ({ value: e.path.replace(/\\/g, '/').endsWith('E:/AI/proj/utils/open-file.lua') }))
  // 24 colonne: la cella del percorso va a capo, ogni pezzo resta un link
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'AssistantMessage', props: { text: filelinkText, isFirstOfReply: true }, viewport: { columns: 24, rows: 20 } })
  const hrefs = (await ui.findAll({ type: 'Link' })).map(l => l.props.href)
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.label)).toContain('⧉ md')
  expect(hrefs.length).toBeGreaterThan(1)
  expect(hrefs.every(h => h === 'vscode://file/E:/AI/proj/utils/open-file.lua:12')).toBe(true)
  await ui.unmount()
})

// local: filelink unito ai percorsi cliccabili di upstream (f6459c2)
const mergedLinks = (on: On, exists: (path: string) => boolean) => {
  mock.env(on, { FORCE_HYPERLINK: '1', HOME: 'E:\\home\\me' })
  on('session.version', () => ({ value: { version: '2.1.302', base: '2.1.302' } }))
  on('session.cwd', () => ({ value: 'E:\\AI\\proj' }))
  on('session.root', () => ({ value: 'E:\\AI\\proj' }))
  on('fs.exists', (_$, e) => ({ value: exists(e.path.replace(/\\/g, '/')) }))
}

test('filelink: in prosa un percorso a un file esistente prende vscode://, uno mancante il file:// di upstream', async ($, on) => {
  mergedLinks(on, path => path.endsWith('E:/AI/proj/utils/open-file.lua'))
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'AssistantMessage', props: { text: 'Vedi ./utils/open-file.lua oppure ./utils/missing.lua ora', isFirstOfReply: true }, viewport: { columns: 100, rows: 20 } })
  const hrefs = (await ui.findAll({ type: 'Link' })).map(l => l.props.href)
  expect(hrefs).toEqual(['vscode://file/E:/AI/proj/utils/open-file.lua', 'file:///E:/AI/proj/utils/missing.lua'])
  await ui.unmount()
})

test('folded: una riga di tool ha il link file:// di upstream al suo file', { options: { toolStyle: 'folded' } }, async ($, on) => {
  mergedLinks(on, () => false)
  const ui = await $.ui.mount({ plugin: 'prismantis', surface: 'terminal', component: 'ToolUse', props: call('Read', { file_path: 'E:\\AI\\proj\\src\\main.ts' }, 't1') })
  expect((await ui.findAll({ type: 'Link' })).map(l => l.props.href)).toEqual(['file:///E:/AI/proj/src/main.ts'])
  expect(await ui.find({ type: 'Text', text: /^Read$/ })).toBeTruthy()
  await ui.unmount()
})
