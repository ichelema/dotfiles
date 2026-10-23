#!/usr/bin/env bun
// Stampa in JSON gli id delle righe sopra l'ultima compattazione che lo schermo non mostra più (`hiddenIds`),
// letti dal transcript della sessione: `[]` se il transcript non c'è ancora (una sessione appena nata o biforcata).
// Uso: bun hidden.mjs <cartella di configurazione di Claude Code> <id della sessione>
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { hiddenIds } from './transcript.ts'

const [config, id] = process.argv.slice(2)
const projects = join(config ?? '', 'projects')
const dir = existsSync(projects) ? readdirSync(projects).find(d => existsSync(join(projects, d, `${id}.jsonl`))) : undefined
if (!dir) {
  console.log('[]')
  process.exit(0)
}
const rows = readFileSync(join(projects, dir, `${id}.jsonl`), 'utf8')
  .split('\n')
  .flatMap(line => {
    try {
      return line ? [JSON.parse(line)] : []
    } catch {
      return []
    }
  })
console.log(JSON.stringify(hiddenIds(rows)))
