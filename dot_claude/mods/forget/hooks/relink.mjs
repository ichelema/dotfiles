#!/usr/bin/env bun
// Dopo una rimozione di /forget ricollega nel transcript le copie dei tool_result tenuti col loro handle
// (relinks in transcript.ts), così --resume ritrova il contesto anche oltre i 5 MB. Scrive sul posto, 36
// caratteri al posto di 36: il motore intanto può aggiungere righe in fondo al file, e nessuna si sposta.
// Uso: bun relink.mjs <cartella di configurazione di Claude Code> <id della sessione> <ms della rimozione>
// Il motore scrive il confine e le copie dopo la risposta dell'hook: si aspetta il confine della rimozione,
// e si ripassa finché, a un secondo dal confine, non resta niente da ricollegare. Stampa {"relinked":N};
// esce con 1 e il motivo su stderr se il confine non arriva o se la catena resta spezzata.
import { closeSync, existsSync, openSync, readFileSync, readdirSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { reachesBoundary, relinks } from './transcript.ts'

const fail = why => {
  console.error(why)
  process.exit(1)
}
const [config, id, at] = process.argv.slice(2)
const since = Number(at)
if (!Number.isFinite(since)) fail(`ms della rimozione non validi: ${at}`)
const projects = join(config ?? '', 'projects')
const dir = existsSync(projects) ? readdirSync(projects).find(d => existsSync(join(projects, d, `${id}.jsonl`))) : undefined
if (!dir) fail(`transcript ${id}.jsonl non trovato in ${projects}`)
const file = join(projects, dir, `${id}.jsonl`)
const PREFIX = '"parentUuid":"'

/** Le righe del file con l'offset in byte di ciascuna; l'ultima, se il motore la sta scrivendo, non si legge. */
function read() {
  const buf = readFileSync(file)
  const starts = []
  const rows = []
  for (let s = 0; s < buf.length; ) {
    let e = buf.indexOf(10, s)
    if (e < 0) e = buf.length
    starts.push(s)
    try {
      rows.push(JSON.parse(buf.toString('utf8', s, e)))
    } catch {
      rows.push(undefined)
    }
    s = e + 1
  }
  return { buf, starts, rows }
}

/** Vero se l'ultimo confine del file è quello della rimozione, non uno di prima. */
function hasCut(rows) {
  const cut = rows.findLastIndex(r => r?.subtype === 'compact_boundary')
  return cut >= 0 && Date.parse(rows[cut].timestamp ?? '') >= since - 2000
}

/** Scrive sul posto il nuovo parentUuid di ogni riga da ricollegare. */
function patch({ buf, starts, rows }, todo) {
  const fd = openSync(file, 'r+')
  try {
    for (const { index, from, to } of todo) {
      const key = Buffer.from(`${PREFIX}${from}"`)
      const pos = buf.indexOf(key, starts[index])
      if (pos < 0 || pos >= (starts[index + 1] ?? buf.length) || to.length !== from.length) fail(`riga ${index}: parentUuid ${from} non trovato`)
      writeSync(fd, Buffer.from(to), 0, to.length, pos + PREFIX.length)
      rows[index].parentUuid = to
    }
  } finally {
    closeSync(fd)
  }
}

let seen = 0
let total = 0
for (let pass = 0; pass < 60; pass++) {
  const t = read()
  if (!hasCut(t.rows)) {
    Bun.sleepSync(200)
    continue
  }
  seen ||= Date.now()
  const todo = relinks(t.rows)
  if (todo.length) patch(t, todo)
  total += todo.length
  if (!todo.length && Date.now() - seen >= 1000) {
    if (!reachesBoundary(t.rows)) fail(`ricollegate ${total} righe, ma dall'ultima risposta la catena non arriva al confine`)
    console.log(JSON.stringify({ relinked: total }))
    process.exit(0)
  }
  Bun.sleepSync(300)
}
fail(seen ? 'il transcript continua a cambiare: ricollegamento non finito' : 'il confine della rimozione non è nel transcript')
