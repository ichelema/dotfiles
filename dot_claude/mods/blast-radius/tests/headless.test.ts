import { expect, test } from 'claude-code/testing'

const start = { cwd: '/w', surface: null, isInteractive: false } as never

test('headless: a risky command is refused at once, a safe one runs', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('tool.call', () => ({ result: { ran: true } as never }))
  await $.session.start(start)

  for (const command of ['rm -fr build', 'rm -r -f build', 'rm --recursive --force build', 'git reset --hard']) {
    const r = await $.tool.call({ tool: 'Bash', tool_use_id: command, command } as never)
    expect(r).toMatchObject({ deny: expect.stringContaining('needs a person to confirm') })
  }
  const ok = await $.tool.call({ tool: 'Bash', tool_use_id: 'ls', command: 'ls -la' } as never)
  expect(ok).toMatchObject({ result: { ran: true } })
})
