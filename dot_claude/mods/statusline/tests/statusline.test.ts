import { expect, test } from 'claude-code/testing'

import { fmtTokens, line, prettyModel, windowFor } from '../hooks/register'

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0)

test('formatta token e finestre come lo script bash', async () => {
  expect([fmtTokens(999), fmtTokens(1500), fmtTokens(1_000_000), fmtTokens(1_250_000)]).toEqual(['999', '2k', '1m', '1.3m'])
  expect(windowFor('claude-opus-5-5[1m]', 200_000)).toBe(1_000_000)
  expect(windowFor('gpt-5.6-sol', 200_000)).toBe(370_000)
  expect(windowFor('gpt-5.4-mini', 200_000)).toBe(1_000_000)
  expect(windowFor('claude-opus-5-5', 0)).toBe(200_000)
})

test('compone la riga con tutti i segmenti', async () => {
  const resets = new Date(NOW + 2 * 3_600_000)
  const out = plain(
    line(
      {
        ponytail: 'ultra',
        model: 'Opus 5.5 (1M context)',
        modelId: 'claude-opus-5-5',
        effort: 'xhigh',
        fast: true,
        cwd: 'E:\\AI\\Claude\\Trinity',
        branch: 'master',
        stat: { add: 12, del: 3 },
        title: 'una sessione con un titolo molto lungo',
        tokens: 50_000,
        window: 200_000,
        cacheRead: 90_000,
        cacheCreate: 10_000,
        lastStepAt: NOW - 30 * 60_000,
        rateLimits: [{ kind: 'five_hour', percentUsed: 42.5, resetsAt: resets.toISOString() }],
      },
      NOW,
    ),
  )
  const hhmm = `${String(resets.getHours()).padStart(2, '0')}:${String(resets.getMinutes()).padStart(2, '0')}`
  expect(out).toBe(
    `[PONYTAIL:ULTRA] | Opus 5.5 1M XHigh ⚡ | Trinity@master (+12 -3) | Session: una sessione con un titolo mol… | 50k/200k (25%) | cache 90k↓/10k↑ (90%) ⏳30m | 5h 43% @${hhmm} | 7d -`,
  )
})

test('senza flag ponytail né cache: niente badge né segmento cache', async () => {
  const out = plain(
    line(
      { model: 'Opus 5.5', modelId: '', fast: false, cwd: '/home/x/repo', tokens: 0, window: 200_000, cacheRead: 0, cacheCreate: 0, rateLimits: [] },
      NOW,
    ),
  )
  expect(out).toBe('Opus 5.5 Medium | repo | 0/200k (0%) | 5h - | 7d -')
})

test('a SessionStart scrive la riga con i dati della sessione', async ($, on) => {
  const files: Record<string, string> = {
    'E:/cfg/.ponytail-active': 'full\n',
    'E:/AI/Repo/.git/HEAD': 'ref: refs/heads/feat/x\n',
  }
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? 'E:\\home' : '/e/cfg' }) as never)
  on('fs.read', (_, e) => {
    // L'engine passa all'hook il path in forma Windows (E:\cfg\...).
    const text = files[e.path.replace(/\\/g, '/')]
    return (text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }) as never
  })
  on('process.run', (_, e) => {
    const stdout = e.argv[0] === 'git' ? ' 2 files changed, 5 insertions(+), 1 deletion(-)\n' : '"customTitle":"primo"\n"customTitle":"rinominata \\"bis\\""\n'
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('clock.every', () => ({ value: undefined }) as never)
  on('clock.now', () => ({ value: 1_000_000 }) as never)
  on('session.cwd', () => ({ value: 'E:\\AI\\Repo' }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1500, window: 200_000 }, rateLimits: [] } }) as never)
  on('settings.read', () => ({ value: { effortLevel: 'high' } }) as never)

  // La statusline nativa stampa CLAUDE_STATUSLINE: la mod deve scriverci la riga intera.
  const written = new Promise<string>(resolve =>
    on('env.set', (_, e) => {
      if (e.name === 'CLAUDE_STATUSLINE') resolve(e.value ?? '')
      return { value: undefined } as never
    }),
  )
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'startup', session_id: 'abcdef1234', transcript_path: 'E:\\t.jsonl' } as never)

  expect(plain(await written)).toBe(
    '[PONYTAIL] | Opus 5.5 High | Repo@feat/x (+5 -1) | Session: rinominata "bis" | 2k/200k (0%) | 5h - | 7d -',
  )
})

test("converte l'id del modello in nome", async () => {
  expect(['claude-opus-5-5', 'claude-opus-5-5[1m]', 'claude-haiku-4-5-20251001', 'claude-fable-5-1', 'gpt-5.6-sol'].map(prettyModel)).toEqual([
    'Opus 5.5',
    'Opus 5.5 1M',
    'Haiku 4.5',
    'Fable 5.1',
    'gpt-5.6-sol',
  ])
})
