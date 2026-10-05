import { expect, test } from 'claude-code/testing'

test('an edit in the main turn is replayed side by side in the pane', async ($, on) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} as never }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('clock.sleep', () => ({ value: undefined }) as never)

  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({
    tool: 'Edit',
    tool_use_id: 'u1',
    file_path: 'a.txt',
    old_string: 'x\nfoo\ny',
    new_string: 'x\nbar\ny',
  })
  await $.turn.complete({
    reason: 'answer',
    answer: 'done',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
  })

  const ran = await $.command.run({ command: 'replay', args: '' } as never)
  expect(ran.text).toBe('Replaying')

  const ui = await $.ui.mount({
    plugin: 'replay',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'replay',
    props: { title: 'Replay', isFocused: true, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 } } as never,
  })
  expect(await ui.find({ type: 'Text', text: /1\/1 a\.txt/ })).toBeDefined()

  // Rows read left, separator, right: foo and bar share a row, x and y pair with themselves.
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const header = texts.findIndex(t => /^1\/1 /.test(t))
  expect(texts.slice(header + 1)).toEqual(['x', ' │ ', 'x', 'foo', ' │ ', 'bar', 'y', ' │ ', 'y'])
})

test('Next hides on the last step and comes back on Prev', async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} as never }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('clock.sleep', () => ({ value: undefined }) as never)

  for (const id of ['u1', 'u2'])
    await $.tool.call({ tool: 'Edit', tool_use_id: id, file_path: `${id}.txt`, old_string: 'a', new_string: 'b' })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  await $.command.run({ command: 'replay', args: '' } as never)

  const ui = await $.ui.mount({
    plugin: 'replay',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'replay',
    props: { title: 'Replay', isFocused: true, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 } } as never,
  })
  expect(await ui.find({ key: 'step:0', text: 'u1.txt  Edit +1 −1' })).toBeDefined()
  expect(await ui.find({ key: 'next' })).toBeDefined()
  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /2\/2/ })).toBeDefined()
  expect(await ui.find({ key: 'next' })).toBeUndefined()
  await ui.press({ key: 'prev' })
  expect(await ui.find({ key: 'next' })).toBeDefined()

  // A click on a step in the list opens it.
  await ui.press({ key: 'step:1' })
  expect(await ui.find({ type: 'Text', text: /2\/2 u2\.txt/ })).toBeDefined()
})

test("delta's ANSI colours become Text colours", async ($, on) => {
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} as never }))
  on('ui.open', () => ({ value: undefined }) as never)
  on('clock.sleep', () => ({ value: undefined }) as never)
  on('env.get', () => ({ value: 'T' }) as never)
  on('fs.write', () => ({ value: undefined }) as never)
  on('process.run', () => ({
    value: {
      exitCode: 1,
      stdout: '\x1b]8;;file://x\x1b\\a\x1b]8;;\x1b\\ \x1b[48;2;0;96;0;38;5;196msubtotal\x1b[0m = 0\n',
      stderr: '',
    },
  }) as never)

  await $.tool.call({ tool: 'Edit', tool_use_id: 'u1', file_path: 'c.rb', old_string: 'sum', new_string: 'subtotal' })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  await $.command.run({ command: 'replay', args: '' } as never)

  const ui = await $.ui.mount({
    plugin: 'replay',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'replay',
    props: { title: 'Replay', isFocused: true, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 } } as never,
  })
  const word = await ui.find({ type: 'Text', text: /^subtotal$/ })
  expect(word?.props).toMatchObject({ backgroundColor: '#006000', color: '#ff0000' })
  // One step: it is the last, so there is no Next.
  expect(await ui.find({ key: 'next' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /8;;/ })).toBeUndefined()
})

test('a long Write skips the LCS, says how many lines are cut, and Close closes', async ($, on) => {
  const old = Array.from({ length: 500 }, (_, k) => `line ${k}`).join('\n')
  const closed: unknown[] = []
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} as never }))
  on('fs.read', () => ({ value: old }) as never)
  on('ui.open', () => ({ value: undefined }) as never)
  on('clock.sleep', () => ({ value: undefined }) as never)
  on('ui.close', (_, e) => {
    closed.push(e)
    return { value: undefined } as never
  })

  await $.tool.call({ tool: 'Write', tool_use_id: 'u1', file_path: 'big.txt', content: `${old}\nend` })
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't1' })
  await $.command.run({ command: 'replay', args: '' } as never)

  const ui = await $.ui.mount({
    plugin: 'replay',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'replay',
    props: { title: 'Replay', isFocused: true, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 } } as never,
  })
  // Past 400 lines nothing is matched: 500 removed beside 501 added.
  expect(await ui.find({ key: 'step:0', text: /Write \+501 −500/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^… \d+ more lines$/ })).toBeDefined()
  await ui.press({ key: 'close' })
  expect(closed).toMatchObject([{ id: 'replay' }])
})
