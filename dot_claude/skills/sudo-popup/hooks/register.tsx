import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const DOT = '•'
const SUDO = /(^|[\s;&|(`])sudo\s/
// Il comando sudo in attesa di password, come lo mostra la fascia.
const ask = atom({ plugin: 'sudo-popup', key: 'ask' } as const, null)

// La password passa a sudo tramite un file 600 in $XDG_RUNTIME_DIR (tmpfs,
// cartella 700) che ~/.local/bin/sudo-askpass.sh legge e cancella.
const sh = ($: EngineInterface, script: string, stdin?: string) =>
  $.process.run(
    ['sh', '-c', `f="$XDG_RUNTIME_DIR/claude-sudo-pass"; ${script}`],
    stdin === undefined ? { timeoutMs: 600_000 } : { stdin },
  )
const CLEAR = 'rm -f "$f" "$f.tmp" "$f.cancel"'
// L'attesa dell'utente sta dentro una chiamata `$`, che non consuma i 10 s
// di tempo proprio dell'hook.
const WAIT =
  'until [ -e "$f" ] || [ -e "$f.cancel" ]; do sleep 0.1; done; [ -e "$f" ]'
const SAVE = 'umask 077; cat > "$f.tmp" && mv "$f.tmp" "$f"'
const CANCEL = ': > "$f.cancel"'

export const register: Register = on => {
  // Mai in $.state: resta solo in questa variabile fino all'invio.
  let password = ''
  let isAsking = false

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (isAsking || !SUDO.test(e.command)) {
      return next(e)
    }
    password = ''
    const cancel = () => void sh($, CANCEL, '')
    next.signal.addEventListener('abort', cancel)

    try {
      await sh($, CLEAR)
      // La password si scrive nella barra del prompt: la bozza che c'era
      // viene messa da parte e rimessa dopo.
      const draft = (await $.prompt.read()).text
      await $.prompt.fill({ text: '' })
      // Solo la vista è accorciata: il comando eseguito è quello intero.
      const flat = e.command.replace(/\s+/g, ' ')
      await update($, ask, () =>
        flat.length > 300 ? `${flat.slice(0, 300)}…` : flat,
      )
      isAsking = true
      const hasPassword = await sh($, WAIT).then(
        ran => ran.exitCode === 0,
        () => false,
      )
      isAsking = false
      password = ''
      await update($, ask, () => null)
      await $.prompt.fill({ text: draft })

      if (!hasPassword) {
        return { deny: 'sudo-popup: comando sudo annullato dall’utente.' }
      }

      return await next(e)
    } finally {
      isAsking = false
      password = ''
      next.signal.removeEventListener('abort', cancel)
      await sh($, CLEAR)
      await update($, ask, () => null)
    }
  })

  // Mentre si aspetta la password ogni carattere scritto nel prompt viene
  // tenuto da parte e nella barra entra un pallino al suo posto.
  on('prompt.edit', ($, e, next) => {
    if (!isAsking) {
      return next(e)
    }
    if (e.text !== DOT.repeat(password.length)) {
      // Barra e password non combaciano: si riparte da vuoto, mai in chiaro.
      password = ''

      return { text: '', cursor: 0 }
    }
    password =
      password.slice(0, e.start) + e.inputText + password.slice(e.end)

    return next({ ...e, inputText: DOT.repeat(e.inputText.length) })
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isAsking || password === '' || e.text !== DOT.repeat(password.length)) {
      return next(e)
    }
    await sh($, SAVE, `${password}\n`)

    return { drop: 'password passata a sudo' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const command = await read($, ask)

    if (command === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text bold>Comando sudo da autorizzare:</Text>
        <Text>{command}</Text>
        <Text color="yellow">
          Scrivi la password qui sotto e premi Invio · Esc annulla
        </Text>
      </Box>
    )
  })
}
