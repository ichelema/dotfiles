import { expect, test } from 'claude-code/testing'

// The agent learns what the user pressed: each Yes/No outcome rides on the main
// loop's next tool result (or deny), else on the next prompt, and only once.
test('outcome: Yes/No reach the agent with the next tool result or prompt, once', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('session.cwd', () => ({ value: '/w' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  for (const op of ['ui.close', 'ui.toast', 'ui.log'] as const) on(op, () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => ($.ui.resolve(e as never) as never as { Text: (p: object) => unknown }).Text({ children: '' }) as never)
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'bash' && e.argv[2]?.startsWith('\nshopt')) return { value: { exitCode: 0, stdout: '1 1024 1\nbuild/a\n', stderr: '' } } as never
    if (e.argv[0] === 'bash' && e.argv[1] === '-c' && e.argv[2] === 'git reset --hard') return { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository\n' } } as never
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('tool.call', () => ({ result: { ran: true } as never }))
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)

  const call = (command: string, extra = {}) => $.tool.call({ tool: 'Bash', tool_use_id: command, command, ...extra } as never)
  await call('rm -rf build')
  await call('git clean -fdx')
  await call('git reset --hard')
  const ui = await $.ui.mount({
    plugin: 'blast-radius', surface: 'terminal', component: 'Pane', requestId: 'blast-radius',
    props: { title: 'Blast Radius', isFocused: true, bodyColumns: 80 } as never,
  })

  // Nothing decided yet: a safe call gets no context
  expect((await call('ls')) as object).not.toHaveProperty('context', expect.anything())

  await ui.press({ key: 'yes1' })
  await ui.press({ key: 'no2' })
  // A subagent's tool result does not take them
  expect((await call('ls', { agentId: 'sub1' })) as object).not.toHaveProperty('context', expect.anything())
  // The main loop's next tool result does, both at once
  const r = (await call('ls')) as { context?: string[] }
  expect(r.context?.join('\n')).toMatch(/#1 `rm -rf build`: the user pressed Yes and it ran successfully/)
  expect(r.context?.join('\n')).toMatch(/#2 `git clean -fdx`: the user pressed No; it did not run/)
  // Only once
  expect((await call('ls')) as object).not.toHaveProperty('context', expect.anything())

  // A failed Yes, then Dismiss: one note, carried by the next prompt
  await ui.press({ key: 'yes3' })
  await ui.press({ key: 'dismiss3' })
  const p = (await $.prompt.submit({ text: 'hi' } as never)) as { context?: string[] }
  expect(p.context?.join('\n')).toMatch(/#3 `git reset --hard`: the user pressed Yes but it failed \(exit 128\)\. stderr tail: fatal: not a git repository/)
  expect(p.context?.join('\n')).not.toMatch(/#3[^\n]*pressed No/)

  // A deny carries them too, in its text
  await call('rm -rf dist')
  await ui.press({ key: 'no4' })
  const d = (await call('rm -rf out')) as { deny?: string }
  expect(d.deny).toMatch(/queued this command as #5[\s\S]*#4 `rm -rf dist`: the user pressed No/)
  await ui.unmount()
})
