#!/usr/bin/env bun
// Stampa le righe dello schermo di un riquadro zellij, una per ogni riga dello schermo, ed esce: e2e.mjs lo lancia a
// ogni lettura. `zellij subscribe` manda subito tutte le righe e poi resta in ascolto: qui si legge il primo messaggio
// e lo si ferma. Tenuto aperto per tutta la sessione, nei giri completi zellij si è bloccato (il test, fermo negli
// spawnSync, non lo leggeva); `dump-screen` invece unisce alcune righe e salta quelle vuote.
// Uso: bun screen.mjs <zellij> <sessione> <riquadro>
const [zellij, session, pane] = process.argv.slice(2)
const sub = Bun.spawn([zellij, '--session', session, 'subscribe', '--pane-id', pane, '--format', 'json'], { stdout: 'pipe', stderr: 'ignore', stdin: 'ignore' })
setTimeout(() => {
  sub.kill()
  process.exit(1)
}, 5000)
const decoder = new TextDecoder()
let buf = ''
for await (const chunk of sub.stdout) {
  buf += decoder.decode(chunk, { stream: true })
  const end = buf.indexOf('\n')
  if (end < 0) continue
  sub.kill()
  const rows = JSON.parse(buf.slice(0, end)).viewport
  if (!Array.isArray(rows)) process.exit(1)
  console.log(rows.map(r => r.trimEnd()).join('\n'))
  process.exit(0)
}
process.exit(1)
