import type { EngineInterface, Register } from 'claude-code'

// Lancia il suono senza aspettarlo (come "async: true" nei settings hooks):
// $.audio.play non suona nei terminali Windows/Linux, quindi passa da play-sound.sh.
const play = ($: EngineInterface, wav: string) => {
  const root = $.plugin.root.replaceAll('\\', '/')
  void $.process.run(['bash', `${root}/play-sound.sh`, wav]).catch(() => {})
}

export const register: Register = on => {
  on('classic.Stop', ($, e, next) => {
    play($, 'Windows_Proximity_Notification.wav')
    return next(e)
  })

  on('classic.Notification', ($, e, next) => {
    if (e.notification_type === 'permission_prompt') play($, 'Windows_Exclamation.wav')
    return next(e)
  })
}
