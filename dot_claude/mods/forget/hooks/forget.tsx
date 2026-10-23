/**
 * turn-forget: toglie dal contesto della conversazione i turni scelti, senza riassunto.
 *
 * Un turno è un prompt scritto dalla persona e tutto quello che lo segue fino al
 * prompt successivo (risposte, chiamate tool, righe del motore). `/forget 7-8`
 * fa eseguire `/compact turn-forget 7-8` (`$.command.run`) appena il comando ha
 * finito; l'hook `session.compact` della mod riconosce le istruzioni
 * `turn-forget …` e risponde al posto del motore con i messaggi rimasti, ognuno
 * con il suo `handle`, così il motore li tiene identici e non chiama il modello.
 *
 * `/forget` senza argomenti apre la selezione: sopra ogni prompt della
 * conversazione compare una casella col numero del turno. Un clic la spunta e
 * riscrive il prompt (`/forget 3 5`); Invio toglie quei turni, `/forget` da solo
 * chiude la selezione. I numeri vengono dal transcript (`prompts.mjs`): prima di
 * togliere, la mod ritrova gli stessi prompt in `e.messages`.
 *
 * Sopra l'ultima compattazione il motore disegna ancora la storia: `ui.render`
 * disegna vuote quelle righe (gli id da `hidden.mjs`, letti all'avvio e dopo ogni
 * rimozione), e anche le righe di tool dei turni tenuti, che il motore mostra una
 * volta sola, al posto vecchio. Restano le righe che `ui.render` non raggiunge
 * (il comando `/compact`, i messaggi della mod); col renderer classico la storia
 * è già nel terminale. Se `hidden.mjs` fallisce, la riga di un turno del
 * contesto ha la sua casella anche lì, le altre la scritta «fuori dal contesto».
 *
 * Non `$.session.compact`: passa da tutti gli hook tranne quelli della mod che la
 * chiama, e il motore farebbe il suo riassunto di tutta la conversazione.
 * `/compact` eseguito con `$.command.run` parte dal motore e passa anche da qui.
 *
 * Gli esiti passano da `$.ui.log`, che il modello non legge: il testo dei turni
 * tolti non rientra nel contesto. Il motore mette il nome della mod davanti a
 * ogni riga.
 *
 * La copia di un tool_result tenuto col suo handle resta agganciata, nel transcript, al tool_use di prima
 * della compattazione: dopo ogni rimozione `relink.mjs` la ricollega alla copia di quel tool_use, così un
 * --resume oltre i 5 MB, che legge il file solo dall'ultimo confine, non perde il contesto.
 *
 * Dopo ogni compattazione il motore riesegue gli hook SessionStart (source
 * `compact`) per rimettere il testo che un riassunto perde. Una rimozione invece
 * lo tiene: la mod salta quella riesecuzione, che lo duplicherebbe.
 *
 * La cartella della mod si chiama `forget` perché le mod di `~/.claude/mods`
 * stanno nella catena in ordine di cartella: prima di prismantis, che disegna i
 * prompt senza chiamare `next`, le caselle restano visibili.
 */
import type { EngineInterface, Register, SessionMessage } from 'claude-code'
import type { Prompts } from './transcript'

const COMMAND = 'forget'
/** L'inizio delle istruzioni di `/compact` che la mod tratta al posto del motore. */
const MARK = 'turn-forget'

/** Una rimozione di /forget è appena entrata nella conversazione: la sua SessionStart:compact va saltata. */
let keepStart = false

/**
 * Le righe di prompt di una selezione: il turno di ogni riga del contesto (per uuid e per id del primo
 * blocco), le righe che lo schermo mostra ancora ma il modello non legge più, i testi dei turni del
 * contesto.
 */
export type Rows = { turns: Map<string, number>; outside: Set<string>; texts: string[] }

/** La selezione aperta da `/forget`: le sue righe e i turni spuntati. */
let selection: (Rows & { picked: Set<number> }) | undefined

/** I prompt della selezione confermata: la rimozione parte solo se `e.messages` comincia con gli stessi. */
let expected: readonly string[] | undefined

/** Gli id delle righe sopra l'ultima compattazione, che lo schermo non disegna più (`hiddenIds`). */
let hidden: Set<string> | undefined

/** Rilegge dal transcript le righe da nascondere e ridisegna; se non ci riesce la storia resta visibile. */
async function loadHidden($: EngineInterface): Promise<void> {
  const r = await helper($, 'hidden.mjs')
  try {
    if (r.exitCode !== 0) throw new Error(r.stderr.trim().slice(0, 200))
    hidden = new Set(JSON.parse(r.stdout) as string[])
    $.ui.invalidate('ui.render')
  } catch (err) {
    $.ui.log(`storia sopra la compattazione non nascosta (${err instanceof Error ? err.message : err})`)
  }
}

/** Intervalli di turni, numerati da 1 ed estremi inclusi: `7-8` è `[7, 8]`. */
export type Ranges = readonly (readonly [number, number])[]

/** Un prompt della persona: ha testo, nessun tool_result, nessun involucro o marcatore del motore. */
export function isPrompt(m: SessionMessage): boolean {
  const t = m.text.trimStart()
  return m.role === 'user' && !m.toolResults?.length && t !== '' && !t.startsWith('<') && !t.startsWith('[Request interrupted')
}

/** I messaggi divisi in turni; quelli prima del primo prompt restano fuori dalla numerazione. */
export function splitTurns(messages: readonly SessionMessage[]): { preamble: SessionMessage[]; turns: SessionMessage[][] } {
  const preamble: SessionMessage[] = []
  const turns: SessionMessage[][] = []
  for (const m of messages) {
    if (isPrompt(m)) turns.push([m])
    else (turns.at(-1) ?? preamble).push(m)
  }
  return { preamble, turns }
}

/** `7-8`, `7`, `3 7-8`, `3,7-8`; undefined quando il testo non è un elenco di turni. */
export function parseTurns(args: string): Ranges | undefined {
  const out: [number, number][] = []
  for (const part of args.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return undefined
    const a = Number(m[1])
    const b = Number(m[2] ?? m[1])
    if (a < 1 || b < a) return undefined
    out.push([a, b])
  }
  return out.length ? out : undefined
}

/** I turni come li scrive `/forget`: in ordine, i consecutivi come intervallo (`3-5 8`). */
export function formatTurns(turns: Iterable<number>): string {
  const sorted = [...new Set(turns)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`)
    i = j
  }
  return out.join(' ')
}

/** I turni scritti dopo `/compact turn-forget`, `""` senza turni; undefined per una compattazione d'altri. */
export function ownArgs(instructions?: string): string | undefined {
  const t = instructions?.trim() ?? ''
  const rest = t.slice(MARK.length)
  return t.startsWith(MARK) && (rest === '' || /^\s/.test(rest)) ? rest.trim() : undefined
}

/** Se i turni cominciano con i prompt indicati, a meno degli spazi: i turni arrivati dopo non contano. */
export function sameStart(turns: readonly SessionMessage[][], texts: readonly string[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  return texts.length <= turns.length && texts.every((t, i) => norm(t) === norm(turns[i]![0]!.text))
}

/**
 * Il turno di ogni riga di prompt. Dopo una compattazione lo schermo mostra ancora sopra di essa le
 * righe di prima: quella che ripete un turno del contesto (`turn`, da `promptRows`) ha la sua
 * casella, le altre sono uscite dal contesto.
 *
 * Ogni riga sta sotto due id: il suo uuid e quello del suo primo blocco. Dal primo messaggio a più
 * blocchi della conversazione (un prompt con un'immagine) il motore disegna i messaggi seguenti con
 * id derivati: i primi 24 caratteri dell'uuid e l'indice del blocco in 12 cifre esadecimali.
 */
export function rowsOf({ current, earlier }: Prompts): Rows {
  const turns = new Map<string, number>()
  const outside = new Set<string>()
  const add = (uuid: string, turn?: number) => {
    for (const id of [uuid, `${uuid.slice(0, 24)}${'0'.repeat(12)}`]) {
      if (turn === undefined) outside.add(id)
      else turns.set(id, turn)
    }
  }
  current.forEach((p, i) => add(p.uuid, i + 1))
  for (const p of earlier) add(p.uuid, p.turn)
  return { turns, outside, texts: current.map(p => p.text) }
}

/** Gli id dei tool_use senza il loro tool_result, e viceversa. */
function orphans(list: readonly SessionMessage[]): Set<string> {
  const uses = new Set(list.flatMap(m => m.toolUses.map(u => u.tool_use_id)))
  const results = new Set(list.flatMap(m => (m.toolResults ?? []).map(r => r.tool_use_id)))
  return new Set([...uses, ...results].filter(id => !(uses.has(id) && results.has(id))))
}

/** La conversazione senza i turni indicati, oppure il motivo per lasciarla com'è. */
export function forget(messages: readonly SessionMessage[], drop: Ranges): { messages: SessionMessage[] } | { skip: string } {
  const { preamble, turns } = splitTurns(messages)
  const last = Math.max(...drop.map(r => r[1]))
  if (last > turns.length) return { skip: `il turno ${last} non esiste: la conversazione ha ${turns.length} turni` }
  const kept = [...preamble, ...turns.filter((_, i) => !drop.some(([a, b]) => i + 1 >= a && i + 1 <= b)).flat()]
  // l'API rifiuta ogni richiesta successiva se un tool_use resta senza il suo tool_result (o il contrario)
  const before = orphans(messages)
  const broken = [...orphans(kept)].filter(id => !before.has(id))
  if (broken.length) return { skip: `toglierei solo metà di una chiamata tool (${broken[0]})` }
  // Fino al primo turno tolto i tool_result restano col loro handle: il motore li tiene interi, con le righe
  // agganciate (promemoria, avvisi), e la richiesta dopo resta uguale fin lì, quindi in cache. La loro copia
  // punta però al tool_use di prima del confine: dopo la compattazione relink.mjs la ricollega alla sua copia.
  // ponytail: dopo il primo turno tolto il motore li ricostruisce senza handle e perde immagini, dati
  // strutturati e righe agganciate; tenuti, se relink.mjs fallisse un --resume ritroverebbe i turni tolti.
  // Togliere quando il motore riaggancia da solo la copia.
  const first = Math.min(...drop.map(r => r[0]))
  const same = new Set([...preamble, ...turns.slice(0, first - 1).flat()])
  return {
    messages: kept.map(m => {
      if (same.has(m) || !m.toolResults?.length) return m
      const { handle: _, ...rebuilt } = m
      return rebuilt
    }),
  }
}

/** Esegue con bun un helper della mod sul transcript della sessione: la cartella di configurazione e l'id, poi `extra`. */
async function helper($: EngineInterface, name: string, ...extra: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))}/.claude`
    const id = await $.session.id()
    return await $.process.run(['bun', `${$.plugin.root}/hooks/${name}`, config, id, ...extra], { timeoutMs: 30_000 })
  } catch (err) {
    return { exitCode: -1, stdout: '', stderr: String(err) }
  }
}

/** Dopo una rimozione: ricollega nel transcript le copie dei tool_result (relink.mjs); avvisa solo se non ci riesce. */
async function relink($: EngineInterface, since: number): Promise<void> {
  const r = await helper($, 'relink.mjs', String(since))
  await loadHidden($)
  if (r.exitCode !== 0) $.ui.log(`transcript non ricollegato (${r.stderr.trim().slice(0, 200)}): un --resume potrebbe perdere il contesto di prima della rimozione`)
}

/** Apre la selezione: legge i prompt dal transcript e ridisegna le righe con le caselle. */
async function open($: EngineInterface): Promise<void> {
  const r = await helper($, 'prompts.mjs')
  if (r.exitCode !== 0) {
    $.ui.log(`caselle non disponibili (${r.stderr.trim().slice(0, 200)}) · usa /${COMMAND} 7-8`)
    return
  }
  selection = { ...rowsOf(JSON.parse(r.stdout) as Prompts), picked: new Set() }
  $.ui.invalidate('ui.render')
  $.ui.log(`${selection.texts.length} turni: clic sulle caselle e il prompt diventa /${COMMAND} con i turni spuntati, Invio li toglie · /${COMMAND} da solo chiude`)
}

/** Chiude la selezione e toglie le caselle. */
function close($: EngineInterface, note?: string): void {
  if (!selection) return
  selection = undefined
  $.ui.invalidate('ui.render')
  if (note) $.ui.log(note)
}

/** Spunta o toglie la spunta di un turno, e riscrive il prompt con i turni spuntati. */
function pick($: EngineInterface, turn: number): void {
  if (!selection) return
  if (!selection.picked.delete(turn)) selection.picked.add(turn)
  $.ui.invalidate('ui.render')
  void $.prompt.fill({ text: `/${COMMAND} ${formatTurns(selection.picked)}`.trim() })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command
      .register({
        name: COMMAND,
        description: 'Toglie dal contesto i turni indicati, senza riassunto (/forget 7-8); senza argomenti mostra le caselle per sceglierli',
        argumentHint: '[turni, es. 7-8]',
      })
      .catch(err => $.ui.log(`/${COMMAND} non registrato: ${err}`))
    void loadHidden($)
    return r
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const args = e.args.trim()
    if (!args) {
      if (selection) close($, 'selezione chiusa, nessun turno tolto')
      // il transcript si legge in un processo a parte: fuori dal tempo che il comando ha
      else $.clock.after(0, () => void open($).catch(err => $.ui.log(`caselle non disponibili: ${err}`)))
      return {}
    }
    if (!parseTurns(args)) {
      $.ui.log(`"${args}" non è un elenco di turni (es. /${COMMAND} 7-8 oppure /${COMMAND} 3 7-8)`)
      return {}
    }
    // turni spuntati nelle caselle: i loro numeri valgono solo se la conversazione è ancora quella
    expected = selection && args === formatTurns(selection.picked) ? selection.texts : undefined
    close($)
    // $.command.run è rifiutato dentro un hook che il turno aspetta: parte appena il comando ha finito
    $.clock.after(0, () => {
      $.command
        .run({ command: 'compact', args: `${MARK} ${args}` })
        .catch(err => $.ui.log(`conversazione invariata: ${err}`))
        // una SessionStart non arrivata durante la compattazione non deve far saltare quella della prossima, che riassume
        .finally(() => {
          keepStart = false
          expected = undefined
        })
    })
    return {}
  })

  // senza .catch un errore qui farebbe girare la compattazione del motore, che riassume tutto
  on('session.compact', async ($, e, next) => {
    const args = ownArgs(e.instructions)
    if (e.agentId !== undefined) return next(e)
    if (args === undefined) {
      // dopo un'altra compattazione le righe hanno altri uuid: le caselle non valgono più
      close($)
      return next(e)
    }
    // da qui mai next(e): con le istruzioni della mod il motore riassumerebbe tutta la conversazione
    const drop = parseTurns(args)
    if (!drop) return { skip: args ? `turn-forget: "${args}" non è un elenco di turni` : 'turn-forget: nessun turno indicato (es. /forget 7-8)' }
    if (expected && !sameStart(splitTurns(e.messages).turns, expected)) {
      return { skip: 'turn-forget: i turni non sono più quelli delle caselle, nessun turno tolto: riapri /forget' }
    }
    const r = forget(e.messages, drop)
    if ('skip' in r) return { skip: `turn-forget: ${r.skip}` }
    keepStart = true
    $.ui.log(`tolti dal contesto i turni ${args}`)
    // il motore scrive il confine e le copie dopo questa risposta: relink.mjs aspetta di trovarli
    const since = Date.now()
    $.clock.after(0, () => void relink($, since))
    return r
  }).catch((_, e, next) => (next.called ? next(e) : { skip: 'turn-forget: errore interno, nessun turno tolto' }))

  // la storia sopra l'ultima compattazione disegnata vuota (ogni componente), e la casella sopra ogni prompt della
  // selezione; cartella prima di prismantis, che non chiama next
  on('ui.render', async ($, e, next) => {
    if (hidden?.has(e.requestId)) {
      const { Box } = $.ui.resolve(e)
      return <Box />
    }
    if (e.component !== 'UserMessage' || !selection) return next(e)
    const turn = selection.turns.get(e.requestId)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (turn === undefined) {
      if (!selection.outside.has(e.requestId)) return next(e)
      // la storia sopra una compattazione: lo schermo la mostra, il modello non la legge più
      return (
        <Box flexDirection="column" alignItems="flex-start">
          <Text dimColor>fuori dal contesto</Text>
          {await next(e)}
        </Box>
      )
    }
    const picked = selection.picked.has(turn)
    return (
      <Box flexDirection="column" alignItems="flex-start">
        <Button key={`forget-${e.requestId}`} plain label={`${picked ? '[x]' : '[ ]'} turno ${turn}`} onPress={() => pick($, turn)} />
        {await next(e)}
      </Box>
    )
  })

  // dopo una rimozione la conversazione ha ancora il testo di questi hook: rieseguirli lo duplicherebbe
  on('classic.SessionStart', async (_, e, next) => {
    if (e.source !== 'compact' || !keepStart) return next(e)
    keepStart = false
    return {}
  })
}
