/**
 * I prompt della conversazione letti dal transcript (il file .jsonl della sessione), con l'uuid di
 * ogni riga: il `requestId` con cui `ui.render` disegna la riga del prompt. `SessionMessage` non ha
 * id, e `$.fs.read` rifiuta i file oltre 4 MiB: `prompts.mjs` legge il file in un processo a parte.
 *
 * E i collegamenti da correggere dopo una rimozione (`relinks`), che `relink.mjs` scrive nel file.
 */

/** Una riga del transcript, con i soli campi che servono qui. */
export type TranscriptRow = {
  type?: string
  subtype?: string
  uuid?: string
  parentUuid?: string | null
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

/** Un collegamento da correggere: la riga `index` del file punta (parentUuid) a `from` e deve puntare a `to`. */
export type Relink = { index: number; from: string; to: string }

/** Gli id dei blocchi `type` (tool_use: `id`, tool_result: `tool_use_id`) di una riga. */
function blockIds(row: TranscriptRow | undefined, type: 'tool_use' | 'tool_result'): string[] {
  const c = row?.message?.content
  if (!Array.isArray(c)) return []
  const blocks = c as { type?: string; id?: unknown; tool_use_id?: unknown }[]
  return blocks.filter(b => b?.type === type).map(b => String(type === 'tool_use' ? b.id : b.tool_use_id))
}

/**
 * Dopo una rimozione di /forget il motore scrive dopo il confine la copia dei messaggi tenuti; la copia di
 * un tool_result tenuto col suo handle punta però al tool_use originale, prima del confine. Oltre i 5 MB
 * --resume legge il file solo dall'ultimo confine, e la catena si spezza lì: il contesto di prima si perde.
 * Ogni copia va ricollegata alla copia della riga a cui puntava: l'ultima riga assistant prima di lei, dopo
 * il confine, con gli stessi tool_use. `rows` sono le righe del file in ordine, undefined dove non si leggono.
 */
export function relinks(rows: readonly (TranscriptRow | undefined)[]): Relink[] {
  const cut = rows.findLastIndex(r => r?.subtype === 'compact_boundary')
  if (cut < 0) return []
  const at = new Map<string, number>()
  rows.forEach((r, i) => {
    if (r?.uuid) at.set(r.uuid, i)
  })
  const out: Relink[] = []
  for (let i = cut + 1; i < rows.length; i++) {
    const r = rows[i]
    const from = r?.parentUuid
    if (r?.type !== 'user' || !from || !blockIds(r, 'tool_result').length) continue
    const p = at.get(from)
    if (p !== undefined && p > cut) continue
    // la riga a cui puntava; se non è nel file, il tool_use del risultato stesso
    const ids = (p === undefined ? blockIds(r, 'tool_result') : blockIds(rows[p], 'tool_use')).join()
    if (!ids) continue
    for (let j = i - 1; j > cut; j--) {
      const c = rows[j]
      if (c?.type === 'assistant' && c.uuid && blockIds(c, 'tool_use').join() === ids) {
        out.push({ index: i, from, to: c.uuid })
        break
      }
    }
  }
  return out
}

/**
 * Vero se, risalendo come --resume dall'ultima risposta dopo l'ultimo confine, la catena arriva al confine
 * senza uscire dalle righe che lo seguono; vero anche senza confine o senza risposte dopo.
 */
export function reachesBoundary(rows: readonly (TranscriptRow | undefined)[]): boolean {
  const cut = rows.findLastIndex(r => r?.subtype === 'compact_boundary')
  if (cut < 0) return true
  const at = new Map<string, number>()
  for (let i = cut; i < rows.length; i++) {
    const u = rows[i]?.uuid
    if (u) at.set(u, i)
  }
  let i = rows.findLastIndex((r, k) => k > cut && r?.type === 'assistant')
  for (let steps = 0; i > cut && steps < rows.length; steps++) {
    const p = rows[i]?.parentUuid
    const j = p ? at.get(p) : undefined
    if (j === undefined) return false
    i = j
  }
  return i <= cut
}

/**
 * Ogni blocco di una riga che ha un id, col suo tipo: `id` dei tool_use, `tool_use_id` dei tool_result. Non
 * `blockIds`: con lo stesso nome questa sostituiva quella di `relinks`, che confrontava allora «[object Object]».
 */
function blockRefs(r: TranscriptRow | undefined): { type?: string; id: string }[] {
  const c = r?.message?.content
  if (!Array.isArray(c)) return []
  return c.flatMap((b: { type?: string; id?: string; tool_use_id?: string }) => {
    const id = b?.id ?? b?.tool_use_id
    return id ? [{ type: b.type, id }] : []
  })
}

/**
 * Gli id con cui `ui.render` disegna le righe sopra l'ultimo confine, che lo schermo non deve più mostrare: l'uuid
 * di ogni riga (anche nella forma derivata dopo un messaggio a più blocchi), `collapsed-<uuid>` per il gruppo di
 * tool chiuso («Ran 1 shell command») e gli id dei tool, meno quelli che si ripetono dopo il confine.
 *
 * Una chiamata tool copiata dopo il confine il motore la disegna una volta sola, al posto dell'originale sopra il
 * confine e con l'id della copia: anche quella va nascosta, così i turni tenuti restano senza le loro righe di tool.
 */
export function hiddenIds(rows: readonly (TranscriptRow | undefined)[]): string[] {
  const cut = rows.findLastIndex(r => r?.subtype === 'compact_boundary')
  if (cut < 0) return []
  const ids = (from: number, to: number) => {
    const out = new Set<string>()
    for (let i = from; i < to; i++) {
      const u = rows[i]?.uuid
      if (u) for (const id of [u, `${u.slice(0, 24)}${'0'.repeat(12)}`, `collapsed-${u}`]) out.add(id)
      for (const b of blockRefs(rows[i])) out.add(b.id)
    }
    return out
  }
  const before = ids(0, cut + 1)
  const after = ids(cut + 1, rows.length)
  const hidden = [...before].filter(id => !after.has(id))
  for (let i = cut + 1; i < rows.length; i++) {
    const calls = blockRefs(rows[i]).filter(b => b.type === 'tool_use' && before.has(b.id))
    if (!calls.length) continue
    hidden.push(`collapsed-${rows[i]!.uuid}`, ...calls.map(b => b.id))
  }
  return hidden
}
