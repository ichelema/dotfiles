#!/usr/bin/env bun
// Stampa in JSON i prompt della sessione dopo l'ultima compattazione, [{ uuid, text }], letti dal suo
// transcript. La mod lo lancia con $.process.run: $.fs.read rifiuta i file oltre 4 MiB.
// Uso: bun prompts.mjs <cartella di configurazione di Claude Code> <id della sessione>
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { promptRows } from './transcript.ts'

const [config, id] = process.argv.slice(2)
const projects = join(config ?? '', 'projects')
const dir = existsSync(projects) ? readdirSync(projects).find(d => existsSync(join(projects, d, `${id}.jsonl`))) : undefined
if (!dir) {
  console.error(`transcript ${id}.jsonl non trovato in ${projects}`)
  process.exit(1)
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
console.log(JSON.stringify(promptRows(rows)))
