import { expect, test } from 'claude-code/testing'

// Headless, so a held command is denied at once: pass vs deny shows the exemption.
test('rm under ~/.claude/tmp runs, anything reaching outside it is still held', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  // As claude.exe sees it on MSYS2: lowercased, while commands write /e/msys64/home/Sphynx.
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? 'e:\\msys64\\home\\sphynx' : undefined }) as never)
  on('tool.call', () => ({ result: { ran: true } as never }))
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false } as never)
  const run = (command: string) => $.tool.call({ tool: 'Bash', tool_use_id: command, command } as never)

  for (const command of [
    'rm -rf ~/.claude/tmp/x',
    'rm -fr "$HOME/.claude/tmp/a b" ${HOME}/.claude/tmp/c',
    'rm -rf /e/msys64/home/Sphynx/.claude/tmp/x E:/msys64/home/Sphynx/.claude/tmp/y',
    'cd ~/.claude/tmp/br-test && rm -rf build',
    'rm -rf ~/.claude/tmp/*.log',
  ])
    expect({ command, r: await run(command) }).toMatchObject({ command, r: { result: { ran: true } } })

  for (const command of [
    'rm -rf ~/.claude/tmp',
    'rm -rf ~/.claude/tmp/',
    'rm -rf ~/.claude/tmp/../projects',
    'rm -rf ~/.claude/tmp/$X',
    'rm -rf ~/.claude/tmp/x ~/src',
    'rm -rf build',
    'rm -rf ~/.claude/tmp/x && rm -rf ~/src',
    'rm -rf ~/.claude/tmpfoo/x',
    'rm -rf E:\\msys64\\home\\Sphynx\\.claude\\tmp\\z',
  ])
    expect({ command, r: await run(command) }).toMatchObject({ command, r: { deny: expect.stringContaining('needs a person') } })
})

// On the VPS CLAUDE_CODE_TMPDIR moves the scratchpads to the data disk.
test('rm under CLAUDE_CODE_TMPDIR runs, its root and anything outside it are held', async ($, on) => {
  const env: Record<string, string> = { HOME: '/home/u', CLAUDE_CODE_TMPDIR: '/mnt/data/home-offload/claude-tmp/' }
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('env.get', (_, e) => ({ value: env[e.name] }) as never)
  on('tool.call', () => ({ result: { ran: true } as never }))
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false } as never)
  const run = (command: string) => $.tool.call({ tool: 'Bash', tool_use_id: command, command } as never)

  for (const command of [
    'rm -rf /mnt/data/home-offload/claude-tmp/claude-1001/-w/s1/scratchpad/target',
    'cd /mnt/data/home-offload/claude-tmp/x && rm -rf build',
    'rm -rf ~/.claude/tmp/x /home/u/.claude/tmp/y',
  ])
    expect({ command, r: await run(command) }).toMatchObject({ command, r: { result: { ran: true } } })

  for (const command of [
    'rm -rf /mnt/data/home-offload/claude-tmp',
    'rm -rf /mnt/data/home-offload/claude-tmp/',
    'rm -rf /mnt/data/home-offload/claude-tmp/../.cache',
    'rm -rf /mnt/data/home-offload/claude-tmpfoo/x',
    'rm -rf /mnt/data/home-offload/claude-tmp/x /mnt/data/home-offload/.cache',
  ])
    expect({ command, r: await run(command) }).toMatchObject({ command, r: { deny: expect.stringContaining('needs a person') } })
})

test('CLAUDE_CODE_TMPDIR set to / exempts nothing', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('env.get', (_, e) => ({ value: e.name === 'CLAUDE_CODE_TMPDIR' ? '/' : undefined }) as never)
  on('tool.call', () => ({ result: { ran: true } as never }))
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false } as never)
  const r = await $.tool.call({ tool: 'Bash', tool_use_id: 'x', command: 'rm -rf /etc/x' } as never)
  expect(r).toMatchObject({ deny: expect.stringContaining('needs a person') })
})

// Trinity's reviewer deletes its scratch folder before `git worktree remove`.
test('rm of .review-tmp inside a review worktree runs, nothing else does', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? 'e:\\msys64\\home\\sphynx' : undefined }) as never)
  on('tool.call', () => ({ result: { ran: true } as never }))
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false } as never)
  const run = (command: string) => $.tool.call({ tool: 'Bash', tool_use_id: command, command } as never)

  for (const command of [
    'rm -rf /srv/repo/.claude/worktrees/review+ICH-184-opus/.review-tmp',
    'rm -rf "/mnt/data/AI/Claude/hindsight-mod/.claude/worktrees/review+ICH-184-opus/.review-tmp/"',
    'rm -rf .claude/worktrees/review+x/.review-tmp',
    'cd /srv/repo/.claude/worktrees/review+x && rm -rf .review-tmp',
    'rm -f E:/AI/Claude/Trinity/.claude/worktrees/review+x/.review-tmp/out.json',
  ])
    expect({ command, r: await run(command) }).toMatchObject({ command, r: { result: { ran: true } } })

  for (const command of [
    'rm -rf /srv/repo/.claude/worktrees/review+x',
    'rm -rf /srv/repo/.claude/worktrees/improvments+x/.review-tmp',
    'rm -rf /srv/repo/.review-tmp',
    'rm -rf .review-tmp',
    'rm -rf /srv/repo/.claude/worktrees/review+x/.review-tmp/../../..',
    'rm -rf /srv/repo/.claude/worktrees/review+x/.review-tmpfoo',
    'rm -rf /srv/repo/.claude/worktrees/review+x/.review-tmp ~/src',
    'rm -rf /srv/repo/.claude/worktrees/review+$X/.review-tmp',
  ])
    expect({ command, r: await run(command) }).toMatchObject({ command, r: { deny: expect.stringContaining('needs a person') } })
})
