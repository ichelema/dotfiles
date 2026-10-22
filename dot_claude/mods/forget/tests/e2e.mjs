#!/usr/bin/env bun
// Test di regressione di /forget nella sessione interattiva di Claude Code (schermo intero), solo Windows.
//
// zellij parte in una console nascosta (Start-Process -WindowStyle Hidden): con stdout su una pipe i
// riquadri del ConPTY ereditano la pipe e lo schermo resta vuoto. Nel riquadro gira
// `claude --resume <conversazione di prova> --fork-session`: la conversazione di prova resta intatta.
// settings.json può impostare CLAUDE_CODE_PLUGIN_DIRS nel suo env, che vince sulla variabile del
// processo: i casi isolano le mod con --settings e caricano questa con --plugin-dir; «utente» no.
//
// Uso: bun tests/e2e.mjs [caso…]   (senza casi: tutti, circa 5 minuti)
//   numeri       /forget 2 su tre turni con un echo: turno tolto senza riassunto, tool_result del
//                turno 1 tenuto col suo handle, del turno 3 ricostruito, dopo --resume il turno 2 non torna
//   inesistente  /forget 9: «Not compacted», nessuna compattazione
//   clic         /forget, clic sulla casella, secondo clic, terzo clic, Invio: turno tolto
//   due          /forget, due caselle spuntate, prompt «/forget 7-8», Invio: tolti tutti e due
//   storico      /forget 2, poi /forget: nella storia sopra la compattazione, che lo schermo mostra
//                ancora, i turni del contesto hanno la loro casella, il turno tolto «fuori dal contesto»
//   utente       le mod vere di ~/.claude/mods (con prismantis): casella sopra il prompt incorniciato,
//                /forget da solo chiude la selezione
//   blocchi      la conversazione si apre con un prompt di due blocchi: da lì il motore disegna le righe
//                con id derivati dall'uuid, e i prompt hanno comunque la loro casella
// Serve: zellij, claude, PowerShell, bun. Lavora in <config>/tmp/turn-forget-e2e: le conversazioni di
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
const POWERSHELL = `${process.env.SystemRoot ?? 'C:/Windows'}/System32/WindowsPowerShell/v1.0/powershell.exe`
const ISOLATE = ['--settings', JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: win(NOMODS) } })]
const TOOL_WORDS = ['MELA', 'TRENO', 'CACTUS']
const SHORT_WORDS = ['MELA', 'TRENO', 'CACTUS', 'LIMONE', 'PERA', 'NAVE', 'SOLE', 'LUNA']
const CASES = ['numeri', 'inesistente', 'clic', 'due', 'storico', 'utente', 'blocchi']

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
const env = { ...process.env, HS_CFG_RETAIN_ENABLED: 'false', HS_CFG_RECALL_ENABLED: 'false', HS_CFG_FAILCHECK_ENABLED: 'false', HS_CFG_MENTAL_MODELS_INJECT_ON_START: 'false' }
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

/** Una sessione interattiva in zellij sulla conversazione di prova; `real`: le mod vere, senza isolamento. */
async function session(name, fixtureId, real = false) {
  const zname = `forget-e2e-${name}`
  const z = (...a) => run([ZELLIJ, '--session', zname, ...a])
  const screens = join(WORK, `${name}.screens.log`)
  writeFileSync(screens, '')
  run([ZELLIJ, 'delete-session', '--force', zname])
  run([POWERSHELL, '-NoProfile', '-Command', `Start-Process -WindowStyle Hidden -FilePath '${ZELLIJ}' -ArgumentList 'attach','-b','${zname}'`])
  await until(() => /terminal_0/.test(z('action', 'list-panes').text), 20_000, 'sessione zellij', 250)
  const args = ['--model', 'haiku', '--resume', fixtureId, '--fork-session', ...(real ? [] : [...ISOLATE, '--plugin-dir', MOD])]
  const pane = /terminal_\d+/.exec(z('run', '--cwd', win(FIX_DIR), '--', CLAUDE, ...args).text)?.[0]
  if (!pane) throw new Error('zellij run senza riquadro')
  z('action', 'toggle-fullscreen')
  const project = projectOf(fixtureId)
  const before = new Set(readdirSync(project))
  const s = {
    last: '',
    look() {
      const text = z('action', 'dump-screen', '--pane-id', pane).text
      if (text !== s.last) appendFileSync(screens, `\n===== ${at()}\n${text}\n`)
      return (s.last = text)
    },
    keys: (...bytes) => z('action', 'write', '--pane-id', pane, ...bytes.map(String)),
    seq: text => s.keys(...Buffer.from(text)),
    async type(text) {
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
    close: () => run([ZELLIJ, 'delete-session', '--force', zname]),
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
    ended: word => new RegExp(`${word}[\\s\\S]*✻ \\S+ for \\d+s`).test(s.look()),
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
      await s.type('/forget 2')
      const boundary = await waitCut(s)
      const rows = s.rows()
      const { after, text } = afterCut(rows)
      check('compattazione senza chiamata al modello', !!boundary && boundary.compactMetadata?.durationMs < 1000)
      check('nessun riassunto', !after.some(r => r.type === 'user' && JSON.stringify(r.message?.content ?? '').includes('being continued from a previous conversation')))
      check('il turno 2 (TRENO) è uscito, 1 e 3 sono rimasti', !text.includes('TRENO') && text.includes('MELA') && text.includes('CACTUS'))
      check('gli hook SessionStart:compact non sono ripartiti', !rows.some(r => r.attachment?.hookName === 'SessionStart:compact'))
      check('la mod dice «tolti dal contesto i turni 2»', s.logs().some(t => t.includes('tolti dal contesto i turni 2')))
      // un tool_result tenuto col suo handle resta agganciato a una riga di prima della compattazione
      const ids = new Set(after.map(r => r.uuid))
      const result = word => after.find(r => r.type === 'user' && Array.isArray(r.message?.content) && r.message.content.some(b => b.type === 'tool_result') && JSON.stringify(r.message.content).includes(word))
      const mela = result('MELA')
      const cactus = result('CACTUS')
      check('tool_result del turno 1 tenuto col suo handle (dati strutturati compresi)', !!mela && !ids.has(mela.parentUuid) && !!mela.toolUseResult)
      check('tool_result del turno 3 ricostruito', !!cactus && ids.has(cactus.parentUuid))
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
      s.click(1, target.y + 1)
      await until(() => s.look().includes(`[x] turno ${k}`) && s.prompt(`/forget ${k}`), 10_000, 'spunta').catch(() => undefined)
      check(`il clic spunta la casella e il prompt diventa «/forget ${k}»`, s.last.includes(`[x] turno ${k}`) && s.prompt(`/forget ${k}`))
      s.click(1, target.y + 1)
      await until(() => s.look().includes(`[ ] turno ${k}`) && s.prompt('/forget'), 10_000, 'spunta tolta').catch(() => undefined)
      check('un secondo clic toglie la spunta e il prompt torna «/forget»', s.last.includes(`[ ] turno ${k}`) && s.prompt('/forget'))
      s.click(1, target.y + 1)
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
      // rotella in su di due colpi (3 righe l'uno), per avere in vista caselle di turni in mezzo
      for (let i = 0; i < 2; i++) s.seq('\x1b[<64;10;5M')
      await Bun.sleep(1500)
      const visible = () => s.look().split('\n').map((l, y) => ({ y, m: /^\[[ x]\] turno (\d+)$/.exec(l) })).filter(b => b.m && b.y > 0 && Number(b.m[1]) <= SHORT_WORDS.length)
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

  async storico() {
    const s = await session('storico', fixture('corti', SHORT_WORDS.map((w, i) => `T${i + 1} ${w}. Rispondi solo: OK ${i + 1}`)))
    try {
      await s.ready('OK 8')
      await s.type('/forget 2')
      await waitCut(s)
      await s.type('/forget')
      await until(() => s.logs().some(t => t.includes('7 turni: clic sulle caselle')), 30_000, 'caselle').catch(() => undefined)
      await Bun.sleep(1500)
      // ctrl+Home: in cima, nella storia sopra la compattazione
      s.seq('\x1b[1;5H')
      await Bun.sleep(1500)
      // le righe non vuote: il motore disegna una riga vuota sopra ogni messaggio, non sempre
      const lines = s.look().split('\n').filter(l => l.trim())
      const at = re => lines.findIndex(l => re.test(l))
      const above = re => lines[at(re) - 1] ?? ''
      const below = re => lines[at(re) + 1] ?? ''
      log(`  in cima: T1 ← ${JSON.stringify(above(/❯\sT1 MELA/).trim())} · T2 ← ${JSON.stringify(above(/❯\sT2 TRENO/).trim())} · dopo OK 2 → ${JSON.stringify(below(/● OK 2/).trim())}`)
      check('nella storia il turno 1 ha la sua casella', above(/❯\sT1 MELA/).includes('[ ] turno 1'))
      check('nella storia il turno tolto dice «fuori dal contesto»', above(/❯\sT2 TRENO/).includes('fuori dal contesto'))
      // il prompt di T3 può restare sotto il bordo: basta la sua casella, la prima riga dopo il turno 2 tolto
      check('nella storia T3 ha la casella del turno 2, come sotto', below(/● OK 2/).startsWith('[ ] turno 2'))
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
