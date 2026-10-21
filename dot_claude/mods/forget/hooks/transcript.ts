/**
 * I prompt della conversazione letti dal transcript (il file .jsonl della sessione), con l'uuid di
 * ogni riga: il `requestId` con cui `ui.render` disegna la riga del prompt. `SessionMessage` non ha
 * id, e `$.fs.read` rifiuta i file oltre 4 MiB: `prompts.mjs` legge il file in un processo a parte.
 */

/** Una riga del transcript, con i soli campi che servono qui. */
export type TranscriptRow = {
  type?: string
  subtype?: string
  uuid?: string
  isMeta?: boolean
  isSidechain?: boolean
  origin?: { kind?: string }
  message?: { content?: unknown }
}

/** Un prompt: l'uuid della sua riga e il suo testo. */
export type PromptRow = { uuid: string; text: string }

/** Una riga di prompt sopra l'ultima compattazione, col turno del contesto che ripete; senza, è fuori. */
export type EarlierRow = { uuid: string; turn?: number }

/** I prompt dopo l'ultima compattazione (i turni del contesto) e quelli prima, che lo schermo mostra ancora. */
export type Prompts = { current: PromptRow[]; earlier: EarlierRow[] }

/** Il testo di una riga user: il contenuto stringa o i blocchi di testo uniti; undefined con un tool_result. */
function userText(row: TranscriptRow): string | undefined {
  const c = row.message?.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return undefined
  const blocks = c as { type?: string; text?: unknown }[]
  if (blocks.some(b => b?.type === 'tool_result')) return undefined
  return blocks.filter(b => b?.type === 'text').map(b => String(b.text ?? '')).join('\n')
}

/** Le righe di prompt, nell'ordine del file, con le stesse esclusioni di `isPrompt`. */
function prompts(rows: readonly TranscriptRow[]): PromptRow[] {
  const out: PromptRow[] = []
  for (const r of rows) {
    if (r.type !== 'user' || r.isMeta || r.isSidechain || !r.uuid) continue
    const text = userText(r)
    const t = text?.trimStart() ?? ''
    if (!t || t.startsWith('<') || t.startsWith('[Request interrupted')) continue
    // un comando messo in coda da una mod (/compact turn-forget 3) lascia questa riga, non un messaggio
    if (r.origin?.kind === 'plugin' && t.startsWith('/')) continue
    out.push({ uuid: r.uuid, text: text! })
  }
  return out
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * I prompt dopo l'ultima compattazione, nell'ordine del file: gli stessi che `splitTurns` conta in
 * `e.messages` (il riassunto di una compattazione compreso). E quelli prima, che lo schermo mostra
 * ancora sopra ogni compattazione, ciascuno col turno del contesto che ripete.
 *
 * Una compattazione di /forget scrive dopo di sé la copia dei turni tenuti, nello stesso ordine: un
 * prompt del tratto prima è il primo prompt del tratto dopo non ancora abbinato con lo stesso testo,
 * se c'è; altrimenti era un turno tolto. Dopo un riassunto il primo prompt è il riassunto, e nessun
 * prompt di prima vi si abbina. Il promptId non serve: una copia prende quello del prompt in corso.
 */
export function promptRows(rows: readonly TranscriptRow[]): Prompts {
  const segments: TranscriptRow[][] = [[]]
  for (const r of rows) {
    if (r.subtype === 'compact_boundary') segments.push([])
    else segments.at(-1)!.push(r)
  }
  const current = prompts(segments.at(-1)!)
  let next: (PromptRow & { turn?: number })[] = current.map((p, i) => ({ ...p, turn: i + 1 }))
  const earlier: EarlierRow[] = []
  for (let j = segments.length - 2; j >= 0; j--) {
    let k = 0
    const before = prompts(segments[j]!).map(p => {
      if (k < next.length && norm(p.text) === norm(next[k]!.text)) return { ...p, turn: next[k++]!.turn }
      return { ...p, turn: undefined }
    })
    earlier.unshift(...before.map(({ uuid, turn }) => (turn === undefined ? { uuid } : { uuid, turn })))
    next = before
  }
  return { current, earlier }
}
