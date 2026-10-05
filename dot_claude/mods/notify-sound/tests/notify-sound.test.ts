import { expect, test } from 'claude-code/testing'

test('suona a fine turno e solo sulla richiesta di permesso', async ($, on) => {
  const played: string[] = []
  on('process.run', (_, e) => {
    played.push(String(e.argv.at(-1)))
    return { exitCode: 0, stdout: '', stderr: '' } as never
  })
  on('classic.Stop', () => ({}))
  on('classic.Notification', () => ({}))

  await $.classic.Stop({ stop_hook_active: false } as never)
  await $.classic.Notification({ notification_type: 'permission_prompt', message: 'ok?' } as never)
  await $.classic.Notification({ notification_type: 'idle_prompt', message: 'idle' } as never)

  expect(played).toEqual(['Windows_Proximity_Notification.wav', 'Windows_Exclamation.wav'])
})
