import type { EngineInterface, Register } from 'claude-code'

// Lancia il suono senza aspettarlo (come "async: true" nei settings hooks):
// $.audio.play non suona nei terminali Windows/Linux, quindi passa da play-sound.sh.
// Senza surface (claude -p o SDK avviati da script e test) nessuno ascolta: niente suono.
const play = async ($: EngineInterface, wav: string) => {
  if ((await $.session.surfaces()).length === 0) return
  const root = $.plugin.root.replaceAll('\\', '/')
  void $.process.run(['bash', `${root}/play-sound.sh`, wav]).catch(() => {})
}

// agent_id c'è solo sugli eventi dei subagenti: per loro niente suono.
export const register: Register = on => {
  on('classic.Stop', async ($, e, next) => {
    // Con task in background il turno è in pausa: la fine del task risveglia la sessione.
    if (!e.agent_id && !e.background_tasks?.length) await play($, 'Windows_Proximity_Notification.wav')
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' && !e.agent_id) await play($, 'Windows_Exclamation.wav')
    return next(e)
  })
}
