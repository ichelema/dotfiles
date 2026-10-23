#!/usr/bin/env bun
// Test di regressione di /forget nella sessione interattiva di Claude Code (schermo intero), su Windows e su Linux.
//
// Su Windows zellij parte in una console nascosta (Start-Process -WindowStyle Hidden): con stdout su una pipe i
// riquadri del ConPTY ereditano la pipe e lo schermo resta vuoto. Su Linux basta `zellij attach -b`. Nel riquadro gira
// `claude --resume <conversazione di prova> --fork-session`: la conversazione di prova resta intatta.
// Lo schermo si legge con screen.mjs da `zellij subscribe --format json`, una riga per ogni riga dello schermo:
// `dump-screen` unisce alcune righe e salta quelle vuote, e i clic finirebbero sulla riga sbagliata.
// settings.json può impostare CLAUDE_CODE_PLUGIN_DIRS nel suo env, che vince sulla variabile del
// processo: i casi isolano le mod con --settings e caricano questa con --plugin-dir; «utente» no.
//
// Uso: bun tests/e2e.mjs [caso…]   (senza casi: tutti, circa 5 minuti)
//   numeri       /forget 2 su tre turni con un echo: turno tolto senza riassunto, dopo il confine
//                nessuna riga punta a prima, dopo --resume il turno 2 non torna
//   cache        /forget dell'ultimo turno: la richiesta dopo ha identici i messaggi prima di quel
//                turno (i promemoria agganciati ai tool_result compresi), quindi la cache resta
//   inesistente  /forget 9: «Not compacted», nessuna compattazione
//   clic         /forget, clic sulla casella, secondo clic, terzo clic, Invio: turno tolto
//   due          /forget, due caselle spuntate, prompt «/forget 7-8», Invio: tolti tutti e due
//   nascondi     /forget 2: sopra la compattazione lo schermo non disegna più la storia, nemmeno le righe di
//                tool dei turni tenuti; un tool nuovo si vede; dopo /forget 3 va via anche la durata del turno
//   utente       le mod vere di ~/.claude/mods (con prismantis): casella sopra il prompt incorniciato,
//                /forget da solo chiude la selezione
//   blocchi      la conversazione si apre con un prompt di due blocchi: da lì il motore disegna le righe
//                con id derivati dall'uuid, e i prompt hanno comunque la loro casella
//   tui          /forget tui su uno schermo di 160 colonne: il pannello agganciato accanto alla conversazione,
//                clic sulla casella, clic sul testo che porta al turno, [forget] toglie, [annulla] chiude
// Una sessione zellij in background ha una misura fissa (su Windows 50 colonne); per «tui» un client zellij della
// misura chiesta gira dentro `conhost --headless` (nessuna finestra) su Windows, in un pty di Bun su Linux, e la
// sessione prende la sua.
// Serve: zellij, claude, bun; su Windows anche PowerShell. Lavora in <config>/tmp/turn-forget-e2e: le conversazioni di
// prova (create con haiku alla prima esecuzione, rifatte se mancano), un log e gli schermi per caso.
// Effetti fuori da quella cartella: la cartella delle conversazioni di prova diventa fidata in
// ~/.claude.json; ogni caso lascia una sessione nuova in <config>/projects.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const win = p => p.replaceAll('\\', '/')
const MOD = win(resolve(import.meta.dir, '..'))
const CONFIG = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
const WORK = join(CONFIG, 'tmp', 'turn-forget-e2e')
const FIX_DIR = join(WORK, 'fixture')
const NOMODS = join(WORK, 'nomods')
const ZELLIJ = Bun.which('zellij')
const CLAUDE = Bun.which('claude')
const WINDOWS = process.platform === 'win32'
const POWERSHELL = `${process.env.SystemRoot ?? 'C:/Windows'}/System32/WindowsPowerShell/v1.0/powershell.exe`
const CONHOST = `${process.env.SystemRoot ?? 'C:/Windows'}/System32/conhost.exe`
const ISOLATE = ['--settings', JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: win(NOMODS) } })]
const TOOL_WORDS = ['MELA', 'TRENO', 'CACTUS']
const SHORT_WORDS = ['MELA', 'TRENO', 'CACTUS', 'LIMONE', 'PERA', 'NAVE', 'SOLE', 'LUNA']
const CASES = ['numeri', 'cache', 'inesistente', 'clic', 'due', 'nascondi', 'utente', 'blocchi', 'tui']

mkdirSync(FIX_DIR, { recursive: true })
mkdirSync(NOMODS, { recursive: true })
const LOG = join(WORK, 'e2e.log')
writeFileSync(LOG, '')
const t0 = Date.now()
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const log = s => {
  console.log(`${at()} ${s}`)
  appendFileSync(LOG, `${at()} ${s}\n`)
}

// la sessione di prova non deve agganciarsi a quella che lancia il test, né scrivere nella memoria Hindsight
// e niente aggiornamento automatico: se fallisce, la sua riga in fondo sposta lo schermo sotto i clic.
// CLAUDE_CODE_NO_FLICKER: schermo intero sempre, anche se l'avvio di prima non è finito, e nessun controllo degli
// avvii. Con "tui": "fullscreen" una sessione chiusa di forza conta come avvio fallito: dopo una, la successiva parte
// col renderer classico (i clic sulle caselle non arrivano); dopo due, il motore spegne lo schermo intero per quella
// versione in ~/.claude.json (fullscreenAutoDisabled), anche nelle sessioni di chi usa la mod.
// INVOCATION_ID: l'hook ntfy claude-notifica esce subito se lo trova. Senza, ogni fine turno di una sessione di prova
// programma un avviso «fine» sul telefono, e una sessione chiusa di forza può non mandare SessionEnd ad annullarlo;
// l'env con cui parte la sessione zellij arriva ai processi dei riquadri
const env = { ...process.env, HS_CFG_RETAIN_ENABLED: 'false', HS_CFG_RECALL_ENABLED: 'false', HS_CFG_FAILCHECK_ENABLED: 'false', HS_CFG_MENTAL_MODELS_INJECT_ON_START: 'false', DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_NO_FLICKER: '1', INVOCATION_ID: 'turn-forget-e2e' }
for (const k of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_PID', 'CLAUDE_ENV_FILE', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_SSE_PORT']) delete env[k]

const run = (cmd, timeout = 15_000) => {
  const r = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore', timeout, env })
  return { code: r.exitCode, text: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
}
async function until(check, ms, label, every = 500) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(every)) {
    const v = check()
    if (v) return v
  }
  throw new Error(`${label}: niente dopo ${ms / 1000} s`)
}
const projectOf = id => {
  const projects = join(CONFIG, 'projects')
  const dir = readdirSync(projects).find(d => existsSync(join(projects, d, `${id}.jsonl`)))
  return dir && join(projects, dir)
}
const readRows = file => readFileSync(file, 'utf8').split('\n').flatMap(l => {
  try {
    return l ? [JSON.parse(l)] : []
  } catch {
    return []
  }
})
/** I turni come li scrive /forget: in ordine, i consecutivi come intervallo («3-5 8»). */
function formatTurns(turns) {
  const s = [...new Set(turns)].sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`)
    i = j
  }
  return out.join(' ')
}

/** Una conversazione di prova, creata con haiku se manca o non è completa. */
function fixture(name, prompts, tools) {
  const file = join(WORK, `${name}.id`)
  const valid = id => {
    const p = projectOf(id)
    if (!p) return false
    const text = readFileSync(join(p, `${id}.jsonl`), 'utf8')
    return text.includes(`OK ${prompts.length}`) && (!tools || (text.match(/"type":"tool_result"/g) ?? []).length >= prompts.length)
  }
  const old = existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
  if (old && valid(old)) return old
  const id = crypto.randomUUID()
  log(`creo la conversazione di prova «${name}» (${prompts.length} turni con haiku): ${id}`)
  prompts.forEach((prompt, i) => {
    const r = Bun.spawnSync([CLAUDE, '-p', prompt, '--model', 'haiku', '--strict-mcp-config', ...(i ? ['--resume', id] : ['--session-id', id]), ...ISOLATE,
      ...(tools ? ['--allowedTools', 'Bash(echo:*)'] : [])], { cwd: FIX_DIR, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 180_000 })
    log(`  turno ${i + 1}: exit=${r.exitCode} ${String(r.stdout ?? '').trim().slice(0, 40)}`)
  })
  if (!valid(id)) throw new Error(`la conversazione di prova «${name}» non è completa (${id})`)
  writeFileSync(file, id)
  return id
}

/**
 * Una conversazione di prova che si apre con un prompt di due blocchi di testo (stream-json): dal primo
 * messaggio a più blocchi il motore disegna i messaggi seguenti con id derivati dall'uuid.
 */
function fixtureBlocks() {
  const file = join(WORK, 'blocchi.id')
  const valid = id => {
    const p = projectOf(id)
    return !!p && readFileSync(join(p, `${id}.jsonl`), 'utf8').includes(`OK ${TOOL_WORDS.length}`)
  }
  const old = existsSync(file) ? readFileSync(file, 'utf8').trim() : ''
  if (old && valid(old)) return old
  const id = crypto.randomUUID()
  log(`creo la conversazione di prova «blocchi» (${TOOL_WORDS.length} turni con haiku, il primo di due blocchi): ${id}`)
  const first = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: `T1 ${TOOL_WORDS[0]}.` }, { type: 'text', text: 'Rispondi solo: OK 1' }] } }
  TOOL_WORDS.forEach((w, i) => {
    const args = i ? ['-p', `T${i + 1} ${w}. Rispondi solo: OK ${i + 1}`, '--resume', id] : ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--session-id', id]
    const r = Bun.spawnSync([CLAUDE, ...args, '--model', 'haiku', '--strict-mcp-config', ...ISOLATE], {
      cwd: FIX_DIR, env, stdin: i ? 'ignore' : Buffer.from(`${JSON.stringify(first)}\n`), stdout: 'pipe', stderr: 'pipe', timeout: 180_000,
    })
    log(`  turno ${i + 1}: exit=${r.exitCode} ${String(r.stdout ?? '').trim().slice(-40)}`)
  })
  if (!valid(id)) throw new Error(`la conversazione di prova «blocchi» non è completa (${id})`)
  writeFileSync(file, id)
  return id
}

/**
 * Una sessione interattiva in zellij sulla conversazione di prova; `real`: le mod vere, senza isolamento;
 * `size` ({ columns, rows }): lo schermo di quella misura, col client zellij dentro `conhost --headless` (Windows) o un pty (Linux).
 */
async function session(name, fixtureId, real = false, size) {
  // un nome per giro: una sessione rimasta bloccata in un giro di prima non ferma questo
  const zname = `forget-e2e-${name}-${process.pid}`
  const z = (...a) => run([ZELLIJ, '--session', zname, ...a])
  const screens = join(WORK, `${name}.screens.log`)
  writeFileSync(screens, '')
  run([ZELLIJ, 'delete-session', '--force', zname])
  // su Linux `attach -b` torna subito anche con stdout su una pipe, e il PID non serve: basta delete-session
  let pid = ''
  if (WINDOWS) pid = run([POWERSHELL, '-NoProfile', '-Command', `(Start-Process -WindowStyle Hidden -PassThru -FilePath '${ZELLIJ}' -ArgumentList 'attach','-b','${zname}').Id`]).text
  else run([ZELLIJ, 'attach', '-b', zname])
  const args = ['--model', 'haiku', '--resume', fixtureId, '--fork-session', ...(real ? [] : [...ISOLATE, '--plugin-dir', MOD])]
  let pane
  let client
  try {
    await until(() => /terminal_0/.test(z('action', 'list-panes').text), 20_000, 'sessione zellij', 250)
    if (size) {
      // lo schermo del client non lo legge nessuno, e una pipe piena lo fermerebbe: stdout su NUL, o data() lo scarta
      client = WINDOWS
        ? Bun.spawn([CONHOST, '--headless', '--width', String(size.columns), '--height', String(size.rows), '--', ZELLIJ, 'attach', zname], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' })
        : Bun.spawn([ZELLIJ, 'attach', zname], { terminal: { cols: size.columns, rows: size.rows, data() {} }, env })
      await Bun.sleep(2000)
    }
    pane = /terminal_\d+/.exec(z('run', '--cwd', win(FIX_DIR), '--', CLAUDE, ...args).text)?.[0]
    if (!pane) throw new Error('zellij run senza riquadro')
  } catch (err) {
    // zellij a volte si blocca all'avvio: il processo resterebbe vivo e la sessione nell'elenco
    client?.kill()
    if (/^\d+$/.test(pid)) run([POWERSHELL, '-NoProfile', '-Command', `Stop-Process -Id ${pid} -Force`])
    run([ZELLIJ, 'delete-session', '--force', zname])
    throw err
  }
  z('action', 'toggle-fullscreen')
  let escAt = 0
  const project = projectOf(fixtureId)
  const before = new Set(readdirSync(project))
  const s = {
    last: '',
    look() {
      // una riga per ogni riga dello schermo (screen.mjs): la riga di una casella è quella da cliccare
      const r = Bun.spawnSync([process.execPath, join(import.meta.dir, 'screen.mjs'), ZELLIJ, zname, pane], { stdout: 'pipe', stderr: 'ignore', stdin: 'ignore', timeout: 10_000, env })
      const view = r.exitCode === 0 ? String(r.stdout).replace(/\n$/, '') : ''
      // in modalità auto il motore apre da solo questo dialogo, anche a turno avviato: Esc vale «Not now», nessuna
      // impostazione cambia. Un secondo Esc a dialogo già chiuso interromperebbe il turno: al massimo uno ogni 2 s
      if (/Teach auto mode about your environment/.test(view) && Date.now() - escAt > 2000) {
        escAt = Date.now()
        s.keys(27)
        log('  chiuso con Esc il dialogo «Teach auto mode about your environment?»')
      }
      if (view !== s.last) appendFileSync(screens, `\n===== ${at()}\n${view}\n`)
      return (s.last = view)
    },
    keys: (...bytes) => z('action', 'write', '--pane-id', pane, ...bytes.map(String)),
    seq: text => s.keys(...Buffer.from(text)),
    async type(text) {
      s.look()
      z('action', 'write-chars', '--pane-id', pane, text)
      await Bun.sleep(800)
      s.keys(13)
      log(`  scritto «${text}» + Invio`)
    },
    /** Clic del mouse a colonna e riga dello schermo, da 1 (sequenze SGR 1006). */
    click(x, y) {
      s.seq(`\x1b[<0;${x};${y}M`)
      s.seq(`\x1b[<0;${x};${y}m`)
      log(`  clic a riga ${y}, colonna ${x}`)
    },
    /** Il prompt mostra `text` («❯» è seguito da uno spazio non separabile, che \s comprende). */
    prompt: text => new RegExp(`❯\\s${text.replace('/', '\\/')}\\s*(─|$)`, 'm').test(s.look()),
    rows: () => readdirSync(project).filter(f => f.endsWith('.jsonl') && !before.has(f)).flatMap(f => readRows(join(project, f))),
    forkId: () => readdirSync(project).find(f => f.endsWith('.jsonl') && !before.has(f))?.replace(/\.jsonl$/, ''),
    logs: () => s.rows().filter(r => r.type === 'system' && /turn-forget/.test(String(r.content ?? ''))).map(r => String(r.content)),
    close: () => {
      client?.kill()
      return run([ZELLIJ, 'delete-session', '--force', zname])
    },
    /** Riga e colonna dello schermo, da 1, del primo testo che `re` trova; undefined se non c'è. */
    find(re) {
      const lines = s.look().split('\n')
      for (let y = 0; y < lines.length; y++) {
        const x = lines[y].search(re)
        if (x >= 0) return { x: x + 1, y: y + 1 }
      }
    },
    /** Aspetta la conversazione ripresa; il dialogo di fiducia ha «No, exit» come scelta predefinita. */
    async ready(word) {
      let trusted = false
      await until(() => {
        const text = s.look()
        if (!trusted && /I trust this folder/.test(text)) {
          trusted = true
          s.keys(27, 91, 66)
          Bun.sleepSync(500)
          s.keys(13)
        }
        return text.includes(word)
      }, 90_000, 'conversazione ripresa')
      await Bun.sleep(2000)
    },
    /** Fine del turno: la riga «✻ … for Ns» dopo `word`; prima, un comando resterebbe in coda. */
    ended: word => new RegExp(`${word}[\\s\\S]*✻ \\S+ for (\\d+m )?\\d+s`).test(s.look()),
  }
  return s
}

/** Le righe della conversazione dopo l'ultima compattazione, e quella compattazione. */
function afterCut(rows) {
  const cut = rows.findLastIndex(r => r.subtype === 'compact_boundary')
  const after = cut < 0 ? [] : rows.slice(cut + 1)
  const text = after.filter(r => r.type === 'user' || r.type === 'assistant').map(r => JSON.stringify(r.message?.content ?? '')).join('\n')
  return { boundary: rows[cut], after, text }
}
async function waitCut(s) {
  const boundary = await until(() => s.rows().find(r => r.subtype === 'compact_boundary'), 60_000, 'compattazione').catch(() => undefined)
  await Bun.sleep(4000)
  return boundary
}

const results = []
function check(name, ok) {
  results.at(-1).checks.push([name, ok])
  log(`  ${ok ? '✓' : '✗'} ${name}`)
}

const cases = {
  async numeri() {
    const s = await session('numeri', fixture('echo', TOOL_WORDS.map((w, i) => `Turno ${i + 1}. La parola segreta numero ${i + 1} è ${w}. Esegui con il tool Bash il comando: echo ${w}. Poi rispondi solo: OK ${i + 1}`), true))
    try {
      await s.ready('OK 3')
      // con --fork-session il transcript nasce al primo messaggio nuovo: senza, la storia copiata finirebbe dopo il confine
      await s.type('Turno 4. La parola segreta numero 4 è LIMONE. Rispondi solo: OK 4')
      await until(() => s.ended('OK 4'), 120_000, 'fine del turno 4')
      await s.type('/forget 2')
      const boundary = await waitCut(s)
      const rows = s.rows()
      const { after } = afterCut(rows)
      // oltre i 5 MB --resume legge solo dall'ultimo confine: una copia che punta a prima spezza la catena lì
      const chain = []
      for (let link = boundary; (link = after.find(r => r.parentUuid === link.uuid)); ) chain.push(link)
      const text = chain.filter(r => r.type === 'user' || r.type === 'assistant').map(r => JSON.stringify(r.message?.content ?? '')).join('\n')
      // come --resume: dall'ultima riga indietro, fino al confine
      const byId = new Map(after.map(r => [r.uuid, r]))
      let back = chain.at(-1)
      while (back?.parentUuid && byId.has(back.parentUuid)) back = byId.get(back.parentUuid)
      log(`  risalendo dall'ultima riga la catena si ferma su: ${back?.type} ${JSON.stringify(back?.message?.content ?? '').slice(0, 80)}`)
      check('compattazione senza chiamata al modello', !!boundary && boundary.compactMetadata?.durationMs < 1000)
      check('nessun riassunto', !text.includes('being continued from a previous conversation'))
      check('la catena dal confine arriva all\'ultima risposta (OK 4)', text.includes('OK 4'))
      check('risalendo dall\'ultima riga si arriva al confine senza uscire', back?.parentUuid === boundary?.uuid)
      check('il turno 2 (TRENO) è uscito, 1 e 3 sono rimasti', !text.includes('TRENO') && text.includes('MELA') && text.includes('CACTUS'))
      check('gli hook SessionStart:compact non sono ripartiti', !rows.some(r => r.attachment?.hookName === 'SessionStart:compact'))
      check('la mod dice «tolti dal contesto i turni 2»', s.logs().some(t => t.includes('tolti dal contesto i turni 2')))
      s.close()
      await Bun.sleep(2000)
      const fork = s.forkId()
      const r = Bun.spawnSync([CLAUDE, '-p', 'Elenca in ordine tutte le parole segrete che ti ho comunicato in questa conversazione, una per riga, senza altro testo.',
        '--model', 'haiku', '--strict-mcp-config', '--resume', fork, ...ISOLATE], { cwd: FIX_DIR, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 180_000 })
      const answer = String(r.stdout ?? '').trim()
      log(`  --resume ${fork}: ${JSON.stringify(answer)}`)
      check('dopo --resume il turno 2 non torna', answer.includes('MELA') && answer.includes('CACTUS') && !answer.includes('TRENO'))
    } finally {
      s.close()
    }
  },

  async cache() {
    const s = await session('cache', fixture('echo', TOOL_WORDS.map((w, i) => `Turno ${i + 1}. La parola segreta numero ${i + 1} è ${w}. Esegui con il tool Bash il comando: echo ${w}. Poi rispondi solo: OK ${i + 1}`), true))
    try {
      await s.ready('OK 3')
      await s.type('Turno 4. La parola segreta numero 4 è LIMONE. Rispondi solo: OK 4')
      await until(() => s.ended('OK 4'), 120_000, 'fine del turno 4')
      await s.type('/forget 4')
      await waitCut(s)
      await s.type('Rispondi solo: OK 5')
      await until(() => s.ended('OK 5'), 120_000, 'fine del turno 5')
      await Bun.sleep(1500)
      // i messaggi di ogni richiesta all'API: le righe api-request li elencano per hash, a partire da una richiesta di base
      const rows = s.rows()
      const cut = rows.findLastIndex(r => r.subtype === 'compact_boundary')
      const all = rows.map((r, i) => [r, i]).filter(([r]) => r.type === 'api-request')
      const byId = new Map(all.map(([r]) => [r.id, r]))
      const msgs = r => {
        const base = r.base && byId.get(r.base)
        if (r.base && !base) throw new Error(`la richiesta di base ${r.base} non è nel transcript`)
        return [...(base ? msgs(base).slice(0, r.keep ?? 0) : []), ...(r.tail ?? [])]
      }
      // solo le richieste della conversazione, non quelle di servizio (titolo, riassunti)
      const reqs = all.filter(([r]) => String(r.querySource ?? '').startsWith('repl_main_thread'))
      const blobs = new Map(rows.filter(r => r.type === 'api-request-blob').map(r => [r.hash, r.message]))
      const before = reqs.filter(([, i]) => i < cut).at(-1)?.[0]
      const after = reqs.find(([, i]) => i > cut)?.[0]
      if (!before || !after) throw new Error(`richieste all'API non trovate (prima: ${!!before}, dopo: ${!!after})`)
      const A = msgs(before), B = msgs(after)
      // il prompt del turno tolto, da cui la richiesta cambia per forza: il motore registra il contenuto (blob) solo
      // dei messaggi sintetici, come i promemoria; la richiesta del turno 4 finisce col suo prompt, l'ultimo senza blob
      const removed = A.findLastIndex(h => !blobs.has(h))
      let same = 0
      while (same < A.length && same < B.length && A[same] === B[same]) same++
      // i numeri della cache qui non si confrontano: la prova è nata con claude -p, e dopo la compattazione il motore
      // passa dal prompt di sistema dell'SDK a quello di Claude Code
      log(`  messaggi: prima ${A.length}, dopo ${B.length}, uguali dall'inizio ${same}, il turno tolto comincia al ${removed}`)
      check('la richiesta dopo /forget ha identici tutti i messaggi prima del turno tolto', removed > 0 && same >= removed)
    } finally {
      s.close()
    }
  },

  async inesistente() {
    const s = await session('inesistente', fixture('echo', TOOL_WORDS.map((w, i) => `Turno ${i + 1}. La parola segreta numero ${i + 1} è ${w}. Esegui con il tool Bash il comando: echo ${w}. Poi rispondi solo: OK ${i + 1}`), true))
    try {
      await s.ready('OK 3')
      await s.type('/forget 9')
      await until(() => s.logs().some(t => t.includes('Not compacted')), 30_000, 'rifiuto').catch(() => undefined)
      await Bun.sleep(2000)
      check('«Not compacted»: il turno 9 non esiste', s.logs().some(t => /Not compacted · turn-forget: il turno 9 non esiste/.test(t)))
      check('nessuna compattazione', !s.rows().some(r => r.subtype === 'compact_boundary'))
    } finally {
      s.close()
    }
  },

  async clic() {
    const s = await session('clic', fixture('corti', SHORT_WORDS.map((w, i) => `T${i + 1} ${w}. Rispondi solo: OK ${i + 1}`)))
    try {
      await s.ready('OK 8')
      // con --fork-session il transcript nasce al primo messaggio nuovo: la selezione lo legge
      await s.type('T9 FINE. Rispondi solo: OK 9')
      await until(() => s.ended('OK 9'), 120_000, 'fine del turno 9')
      await s.type('/forget')
      await until(() => s.look().includes('[ ] turno 9'), 30_000, 'caselle').catch(() => undefined)
      check('la riga della mod spiega cosa fare', s.logs().some(t => t.includes('9 turni: clic sulle caselle')))
      // righe corte e senza prismantis: la riga del dump è la riga dello schermo
      const boxes = s.last.split('\n').map((l, y) => ({ y, m: /^\[ \] turno (\d+)$/.exec(l) })).filter(b => b.m && b.y > 0)
      const target = boxes.at(-2) ?? boxes.at(-1)
      if (!target) throw new Error('nessuna casella su una riga sua')
      const k = Number(target.m[1])
      const word = [...SHORT_WORDS, 'FINE'][k - 1]
      log(`  caselle visibili: ${boxes.map(b => b.m[1]).join(', ')} · bersaglio: turno ${k} (${word})`)
      // la riga della casella si rilegge prima di ogni clic: una riga che compare o sparisce in fondo sposta lo schermo
      const row = () => s.look().split('\n').findIndex((l, y) => y > 0 && /^\[[ x]\] turno (\d+)$/.exec(l)?.[1] === String(k)) + 1
      s.click(1, row())
      await until(() => s.look().includes(`[x] turno ${k}`) && s.prompt(`/forget ${k}`), 10_000, 'spunta').catch(() => undefined)
      check(`il clic spunta la casella e il prompt diventa «/forget ${k}»`, s.last.includes(`[x] turno ${k}`) && s.prompt(`/forget ${k}`))
      s.click(1, row())
      await until(() => s.look().includes(`[ ] turno ${k}`) && s.prompt('/forget'), 10_000, 'spunta tolta').catch(() => undefined)
      check('un secondo clic toglie la spunta e il prompt torna «/forget»', s.last.includes(`[ ] turno ${k}`) && s.prompt('/forget'))
      s.click(1, row())
      await until(() => s.look().includes(`[x] turno ${k}`) && s.prompt(`/forget ${k}`), 10_000, 'spunta di nuovo').catch(() => undefined)
      s.keys(13)
      const boundary = await waitCut(s)
      const { text } = afterCut(s.rows())
      check(`il turno ${k} (${word}) è uscito senza riassunto, gli altri sono rimasti`, !!boundary && boundary.compactMetadata?.durationMs < 1000 &&
        !text.includes(word) && [...SHORT_WORDS, 'FINE'].filter(w => w !== word).every(w => text.includes(w)))
      check('le caselle spariscono dopo la rimozione', !s.look().includes('] turno '))
    } finally {
      s.close()
    }
  },

  async due() {
    const s = await session('due', fixture('corti', SHORT_WORDS.map((w, i) => `T${i + 1} ${w}. Rispondi solo: OK ${i + 1}`)))
    try {
      await s.ready('OK 8')
      await s.type('T9 FINE. Rispondi solo: OK 9')
      await until(() => s.ended('OK 9'), 120_000, 'fine del turno 9')
      await s.type('/forget')
      await until(() => s.look().includes('[ ] turno 9'), 30_000, 'caselle').catch(() => undefined)
      // rotella in su di due colpi (su Windows 3 righe l'uno), per avere in vista caselle di turni in mezzo
      for (let i = 0; i < 2; i++) s.seq('\x1b[<64;10;5M')
      await Bun.sleep(1500)
      const visible = () => s.look().split('\n').map((l, y) => ({ y, m: /^\[[ x]\] turno (\d+)$/.exec(l) })).filter(b => b.m && b.y > 0 && Number(b.m[1]) <= SHORT_WORDS.length)
      // fuori da Windows il motore scorre di una riga a colpo, e due colpi ravvicinati valgono due righe: altri colpi, distanziati
      for (let i = 0; i < 10 && visible().length < 2; i++) {
        s.seq('\x1b[<64;10;5M')
        await Bun.sleep(500)
      }
      const seen = visible()
      const picks = (seen.length > 2 ? [seen[0], seen[2]] : seen.slice(0, 2)).map(b => Number(b.m[1]))
      log(`  caselle visibili: ${seen.map(b => b.m[1]).join(', ')} · spunto: ${picks.join(', ')}`)
      if (picks.length < 2) throw new Error('meno di due caselle su una riga loro')
      for (const [i, k] of picks.entries()) {
        const box = visible().find(b => Number(b.m[1]) === k)
        if (!box) throw new Error(`la casella del turno ${k} non è più su una riga sua`)
        s.click(1, box.y + 1)
        const want = `/forget ${formatTurns(picks.slice(0, i + 1))}`
        await until(() => s.look().includes(`[x] turno ${k}`) && s.prompt(want), 10_000, `spunta del turno ${k}`).catch(() => undefined)
        check(`spunto il turno ${k}: il prompt diventa «${want}»`, s.last.includes(`[x] turno ${k}`) && s.prompt(want))
      }
      s.keys(13)
      const boundary = await waitCut(s)
      const { text } = afterCut(s.rows())
      const gone = picks.map(k => SHORT_WORDS[k - 1])
      check(`i turni ${picks.join(' e ')} (${gone.join(', ')}) sono usciti senza riassunto, gli altri sono rimasti`, !!boundary && boundary.compactMetadata?.durationMs < 1000 &&
        gone.every(w => !text.includes(w)) && [...SHORT_WORDS, 'FINE'].filter(w => !gone.includes(w)).every(w => text.includes(w)))
      check(`la mod dice «tolti dal contesto i turni ${formatTurns(picks)}»`, s.logs().some(t => t.includes(`tolti dal contesto i turni ${formatTurns(picks)}`)))
    } finally {
      s.close()
    }
  },

  async nascondi() {
    const s = await session('nascondi', fixture('echo', TOOL_WORDS.map((w, i) => `Turno ${i + 1}. La parola segreta numero ${i + 1} è ${w}. Esegui con il tool Bash il comando: echo ${w}. Poi rispondi solo: OK ${i + 1}`), true))
    try {
      await s.ready('OK 3')
      s.seq('\x1b[1;5H')
      await Bun.sleep(1500)
      const count = (text, re) => (text.match(new RegExp(re, 'g')) ?? []).length
      const top0 = s.look()
      log(`  prima, in cima: Turno 1 ×${count(top0, 'Turno 1\\.')} · echo MELA ×${count(top0, 'echo MELA')}`)
      s.seq('\x1b[1;5F')
      await s.type('/forget 2')
      await waitCut(s)
      await Bun.sleep(3000)
      s.seq('\x1b[1;5H')
      await Bun.sleep(1500)
      const top = s.look()
      const lines = top.split('\n')
      log(`  dopo, in cima:\n${lines.map(l => `    |${l}`).join('\n')}`)
      const first = lines.findIndex(l => /Turno 1\./.test(l))
      check('il turno tolto non compare più', count(top, 'Turno 2\\.') === 0 && count(top, 'TRENO') === 0)
      check('il turno 1 compare una volta sola', count(top, 'Turno 1\\.') === 1)
      check('sopra il turno 1 nessun gruppo di tool della storia', first > 0 && !lines.slice(0, first).some(l => /Ran \d+ shell command/.test(l)))
      check('nessun avviso «storia non nascosta»', !s.logs().some(t => t.includes('storia non nascosta')))
      check('nessuna riga di tool copiata sullo schermo', !/Ran \d+ shell command/.test(top))
      // un tool chiamato dopo la rimozione resta visibile
      s.seq('\x1b[1;5F')
      await s.type('Turno 4. La parola segreta numero 4 è LIMONE. Esegui con il tool Bash il comando: echo LIMONE. Poi rispondi solo: OK 4')
      await until(() => s.ended('OK 4'), 120_000, 'fine del turno 4').catch(() => undefined)
      const end = s.look()
      log(`  dopo il turno 4, in fondo:\n${end.split('\n').map(l => `    |${l}`).join('\n')}`)
      check('il tool del turno 4 si vede', /OK 4/.test(end) && /Ran \d+ shell command|echo LIMONE/.test(end))
      // una seconda rimozione: anche la durata del turno tolto va via. Restano le righe che ui.render non raggiunge:
      // «/compact turn-forget …» con «Compacted», «1 agent type available» e i messaggi della mod
      await s.type('/forget 3')
      await until(() => s.rows().filter(r => r.subtype === 'compact_boundary').length >= 2, 60_000, 'seconda compattazione').catch(() => undefined)
      await Bun.sleep(4000)
      s.seq('\x1b[1;5H')
      await Bun.sleep(1500)
      const top2 = s.look()
      log(`  dopo /forget 3, in cima:\n${top2.split('\n').map(l => `    |${l}`).join('\n')}`)
      check('dopo la seconda rimozione il turno 4 non compare più', !/LIMONE/.test(top2))
      check('dopo la seconda rimozione niente durata del turno tolto', !/✻ \S+ for \d+s/.test(top2))
      check('dopo la seconda rimozione il turno 1 compare una volta sola', count(top2, 'Turno 1\\.') === 1)
    } finally {
      s.close()
    }
  },

  async tui() {
    const s = await session('tui', fixture('corti', SHORT_WORDS.map((w, i) => `T${i + 1} ${w}. Rispondi solo: OK ${i + 1}`)), false, { columns: 160, rows: 24 })
    const show = label => log(`  ${label}:\n${s.look().split('\n').map(l => `    |${l}`).join('\n')}`)
    // il pannello è aperto finché si vede il suo pulsante [annulla]
    const isOpen = () => /\[ annulla \]/.test(s.look())
    try {
      await s.ready('OK 8')
      // con --fork-session il transcript nasce al primo messaggio nuovo: il pannello lo legge
      await s.type('T9 FINE. Rispondi solo: OK 9')
      await until(() => s.ended('OK 9'), 120_000, 'fine del turno 9')
      await s.type('/forget tui')
      await until(() => /9 turni nel contesto/.test(s.look()), 30_000, 'pannello').catch(() => undefined)
      await Bun.sleep(1000)
      show('col pannello')
      const head = s.find(/9 turni nel contesto/)
      check('il pannello mostra i 9 turni del contesto', !!head)
      log(`  il pannello comincia alla colonna ${head?.x} di 160`)
      // il motore aggancia il pannello a destra della conversazione: l'API delle mod non sceglie il lato
      check('il pannello è agganciato accanto alla conversazione', !!head && head.x > 80)
      // la casella del turno 3
      const box = s.find(/\[ \] 3 T3 CACTUS/)
      if (box) s.click(box.x, box.y)
      await until(() => /\[x\] 3 T3 CACTUS/.test(s.look()), 10_000, 'spunta').catch(() => undefined)
      check('il clic sulla casella spunta il turno 3', /\[x\] 3 T3 CACTUS/.test(s.last) && /spuntati: 3/.test(s.last))
      // il testo del turno 1: il suo prompt, fuori dallo schermo, torna in vista
      const before = /❯\sT1 MELA/.test(s.look())
      const text = s.find(/1 T1 MELA/)
      if (text) s.click(text.x + 2, text.y)
      await until(() => /❯\sT1 MELA/.test(s.look()), 10_000, 'turno 1 in vista').catch(() => undefined)
      show('dopo il clic sul turno 1')
      check('il clic sul testo porta la conversazione al prompt del turno 1', !before && /❯\sT1 MELA/.test(s.last))
      // [forget]
      const go = s.find(/\[ forget \]/)
      if (go) s.click(go.x + 2, go.y)
      const cut = await waitCut(s)
      const { text: kept } = afterCut(s.rows())
      check('[forget] toglie il turno spuntato, gli altri restano', !!cut && !kept.includes('T3 CACTUS') && kept.includes('T4 LIMONE') && kept.includes('T1 MELA'))
      check('dopo [forget] il pannello è chiuso', !isOpen())
      // di nuovo il pannello, poi [annulla]
      await s.type('/forget tui')
      await until(() => /8 turni nel contesto/.test(s.look()), 30_000, 'pannello di nuovo').catch(() => undefined)
      check('riaperto, il pannello ha gli 8 turni rimasti', /8 turni nel contesto/.test(s.last))
      const box1 = s.find(/\[ \] 1 T1 MELA/)
      if (box1) s.click(box1.x, box1.y)
      await until(() => /\[x\] 1 T1 MELA/.test(s.look()), 10_000, 'spunta').catch(() => undefined)
      const cancel = s.find(/\[ annulla \]/)
      if (cancel) s.click(cancel.x + 2, cancel.y)
      await until(() => !isOpen(), 10_000, 'chiusura').catch(() => undefined)
      await Bun.sleep(2000)
      check('[annulla] chiude il pannello', !isOpen())
      check('[annulla] non toglie nulla', s.rows().filter(r => r.subtype === 'compact_boundary').length === 1 && s.logs().some(t => t.includes('nessun turno tolto')))
    } finally {
      s.close()
    }
  },

  async utente() {
    const s = await session('utente', fixture('echo', TOOL_WORDS.map((w, i) => `Turno ${i + 1}. La parola segreta numero ${i + 1} è ${w}. Esegui con il tool Bash il comando: echo ${w}. Poi rispondi solo: OK ${i + 1}`), true), true)
    try {
      await s.ready('OK 3')
      await s.type('Turno 4. La parola segreta numero 4 è LIMONE. Rispondi solo: OK 4')
      await until(() => s.ended('OK 4'), 120_000, 'fine del turno 4')
      await s.type('/forget')
      await until(() => s.look().includes('[ ] turno 4'), 30_000, 'caselle').catch(() => undefined)
      const framed = /⠉⠟⠟⠻⠻⠉ Turno 4/.test(s.last)
      log(`  prismantis incornicia i prompt: ${framed ? 'sì' : 'no (la casella va comunque sopra il prompt)'}`)
      check('la casella sta sopra il prompt dal composer', framed ? /\[ \] turno 4\s*┌/.test(s.last) : /\[ \] turno 4\s*❯/.test(s.last))
      await s.type('/forget')
      await until(() => s.logs().some(t => t.includes('selezione chiusa')), 15_000, 'chiusura').catch(() => undefined)
      await Bun.sleep(1500)
      check('/forget da solo chiude la selezione', s.logs().some(t => t.includes('selezione chiusa, nessun turno tolto')) && !s.look().includes('[ ] turno'))
      check('nessuna compattazione', !s.rows().some(r => r.subtype === 'compact_boundary'))
    } finally {
      s.close()
    }
  },

  async blocchi() {
    const s = await session('blocchi', fixtureBlocks())
    try {
      await s.ready('OK 3')
      await s.type('T4 FINE. Rispondi solo: OK 4')
      await until(() => s.ended('OK 4'), 120_000, 'fine del turno 4')
      await s.type('/forget')
      await until(() => s.look().includes('[ ] turno 4'), 30_000, 'caselle').catch(() => undefined)
      const boxes = [...s.last.matchAll(/\[[ x]\] turno (\d+)/g)].map(m => m[1])
      log(`  caselle in vista: ${boxes.join(', ') || 'nessuna'}`)
      check('dopo un prompt di due blocchi il prompt nuovo ha la sua casella', /\[ \] turno 4\s*❯/.test(s.last))
      check('anche il prompt di un turno di prima ha la sua casella', /\[ \] turno [23]\s*❯/.test(s.last))
    } finally {
      s.close()
    }
  },
}

const wanted = process.argv.slice(2).filter(Boolean)
const unknown = wanted.filter(c => !CASES.includes(c))
if (unknown.length) {
  console.error(`casi sconosciuti: ${unknown.join(', ')} · casi: ${CASES.join(', ')}`)
  process.exit(2)
}
if (!ZELLIJ || !CLAUDE) {
  console.error(`manca ${!ZELLIJ ? 'zellij' : 'claude'} nel PATH`)
  process.exit(2)
}
log(`START mod=${MOD} lavoro=${win(WORK)} casi=${(wanted.length ? wanted : CASES).join(', ')}`)
for (const name of wanted.length ? wanted : CASES) {
  results.push({ name, checks: [] })
  log(`== ${name}`)
  await cases[name]().catch(err => {
    log(`  ERRORE: ${err.message}`)
    results.at(-1).checks.push(['caso completato', false])
  })
}
log('== esito')
for (const r of results) log(`  ${r.checks.length && r.checks.every(([, ok]) => ok) ? 'VERDE' : 'ROSSO'} ${r.name}`)
const pass = results.every(r => r.checks.length && r.checks.every(([, ok]) => ok))
log(pass ? 'VERDE (PASS)' : 'ROSSO (FAIL)')
log(`log: ${win(LOG)}`)
process.exitCode = pass ? 0 : 1
