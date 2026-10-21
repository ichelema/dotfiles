import { expect, test } from 'claude-code/testing'

test('suona a fine turno e solo sulla richiesta di permesso', async ($, on) => {
  const played: string[] = []
  on('process.run', (_, e) => {
    played.push(String(e.argv.at(-1)))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('classic.Stop', () => ({}))
  on('classic.Notification', () => ({}))

  await $.classic.Stop({ stop_hook_active: false } as never)
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'ok?' } as never)
  await $.classic.Notification({ notification_type: 'idle_prompt', message: 'idle' } as never)
  // eventi dei subagenti: muti
  await $.classic.Stop({ stop_hook_active: false, agent_id: 'a1' } as never)
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'ok?', agent_id: 'a1' } as never)
  // turno in pausa su un task in background: muto, la fine del task risveglia la sessione
  const task = { id: 'b1', type: 'shell', status: 'running', description: 'prova' }
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [task] } as never)

  expect(played).toEqual(['Windows_Proximity_Notification.wav', 'Windows_Exclamation.wav'])
})

test('muto senza surface (claude -p e SDK avviati da script e test)', async ($, on) => {
  const played: string[] = []
  on('process.run', (_, e) => {
    played.push(String(e.argv.at(-1)))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.surfaces', () => ({ value: [] }) as never)
  on('classic.Stop', () => ({}))
  on('classic.Notification', () => ({}))

  await $.classic.Stop({ stop_hook_active: false } as never)
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'ok?' } as never)

  expect(played).toEqual([])
})
