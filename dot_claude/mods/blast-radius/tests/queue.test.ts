import { expect, test } from 'claude-code/testing'

// Interactive: a risky command is refused at once and queued; the agent is never held.
// Yes runs it through bash from the mod, No drops it; a success leaves the pane, a
// failure stays on it in red with the tail of stderr until Dismiss.
test('queue: deny at once, Yes runs in bash, No drops, a failure stays until Dismiss', async ($, on) => {
  const ran: string[][] = []
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('session.cwd', () => ({ value: '/w' }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  for (const op of ['ui.close', 'ui.toast', 'ui.log'] as const) on(op, () => ({ value: undefined }) as never)
  on('ui.render', ($, e) => ($.ui.resolve(e as never) as never as { Text: (p: object) => unknown }).Text({ children: '' }) as never) // an empty pane once the queue is empty
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    // measuring: "files bytes found" then the file list; a real run: exit 0, or 128 for git
    if (e.argv[0] === 'bash' && e.argv[2]?.startsWith('\nshopt')) return { value: { exitCode: 0, stdout: '2 2048 1\nbuild/a\nbuild/b\n', stderr: '' } } as never
    if (e.argv[0] === 'bash' && e.argv[1] === '-c' && e.argv[2] === 'git reset --hard') return { value: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository\n' } } as never
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('tool.call', () => ({ result: { ran: true } as never }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true } as never)

  const call = (command: string) => $.tool.call({ tool: 'Bash', tool_use_id: command, command } as never)
  expect(await call('rm -rf build')).toMatchObject({ deny: expect.stringContaining('queued this command as #1') })
  expect(await call('git clean -fdx')).toMatchObject({ deny: expect.stringContaining('queued this command as #2') })
  expect(await call('git reset --hard')).toMatchObject({ deny: expect.stringContaining('queued this command as #3') })
  const didRun = (command: string) => ran.some((a) => a[0] === 'bash' && a[1] === '-c' && a[2] === command)
  expect(didRun('rm -rf build')).toBe(false) // measured, not run

  const ui = await $.ui.mount({
    plugin: 'blast-radius', surface: 'terminal', component: 'Pane', requestId: 'blast-radius',
    props: { title: 'Blast Radius (3)', isFocused: true, bodyColumns: 80 } as never,
  })
  const shown = (re: RegExp) => ui.find({ type: 'Text', text: re })
  expect(await shown(/3 waiting/)).toBeDefined()
  expect((await ui.find({ key: 'yes1' }))?.props).toMatchObject({ hotkey: '1' })
  expect((await ui.find({ key: 'yes2' }))?.props).not.toMatchObject({ hotkey: '1' })

  // Yes on #1: runs, leaves the list
  await ui.press({ key: 'yes1' })
  expect(didRun('rm -rf build')).toBe(true)
  expect(await shown(/rm -rf build/)).toBeUndefined()
  expect(await shown(/2 waiting/)).toBeDefined()

  // No on #2: never runs, leaves the list
  await ui.press({ key: 'no2' })
  expect(didRun('git clean -fdx')).toBe(false)
  expect(await shown(/git clean -fdx/)).toBeUndefined()

  // Yes on #3: fails, stays in red with stderr, no Yes/No left, Dismiss takes it off
  await ui.press({ key: 'yes3' })
  expect(didRun('git reset --hard')).toBe(true)
  expect(await shown(/git reset --hard/)).toBeDefined()
  expect((await shown(/exit 128/))?.props).toMatchObject({ color: 'red' })
  expect((await shown(/not a git repository/))?.props).toMatchObject({ color: 'red' })
  expect(await ui.find({ key: 'yes3' })).toBeUndefined()
  await ui.press({ key: 'dismiss3' })
  expect(ran.filter((a) => a[1] === '-c' && a[2] === 'git reset --hard')).toHaveLength(1)
  expect(await shown(/git reset --hard/)).toBeUndefined()
  await ui.unmount()
})
