import { expect, test } from 'claude-code/testing'

// Headless, so a held command is denied at once: pass vs deny shows the exemption.
test('rm under ~/.claude/tmp runs, anything reaching outside it is still held', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  // As claude.exe sees it on MSYS2: lowercased, while commands write /e/msys64/home/Sphynx.
  on('env.get', () => ({ value: 'e:\\msys64\\home\\sphynx' }) as never)
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

// Trinity's reviewer deletes its scratch folder before `git worktree remove`.
test('rm of .review-tmp inside a review worktree runs, nothing else does', async ($, on) => {
  on('session.start', () => ({ cwd: '/w' }) as never)
  on('env.get', () => ({ value: 'e:\\msys64\\home\\sphynx' }) as never)
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
