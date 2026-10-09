import type { Register } from 'claude-code'

// Alias di ~/.litellm/litellm_config.yaml. È anche la "pillola avvelenata": se l'hook
// fallisse, il motore manderebbe la richiesta ad api.anthropic.com con questo nome
// e riceverebbe un errore visibile, mai un ripiego silenzioso su Claude.
const MODEL = 'claude-gpt-5-6-sol-xhigh'
const LITELLM = 'http://127.0.0.1:4000'

const PROMPT = `Sei un subagente al servizio di un orchestratore, dentro Claude Code.
Operi in autonomia: l'orchestratore non può rispondere mentre lavori.
Leggi i file rilevanti prima di concludere: non speculare.
Prima di ogni gruppo di chiamate ai tool scrivi una riga breve su cosa stai per fare e perché.
Fermati solo per azioni distruttive o veri cambi di perimetro.
Chiudi con una sintesi breve: cosa hai fatto, cosa hai verificato, cosa resta aperto.`

// ponytail: schemi ridotti dei tool built-in (il motore non li espone alle mod);
// il motore esegue il tool con questi argomenti. Allineare a mano se Claude Code li cambia.
const str = { type: 'string' }
const int = { type: 'integer' }
const TOOLS = [
  { name: 'Read', description: 'Legge un file: testo con numeri di riga, immagini, PDF.', input_schema: { type: 'object', properties: { file_path: str, offset: int, limit: int }, required: ['file_path'] } },
  { name: 'Grep', description: 'Cerca un pattern (ripgrep) nei file.', input_schema: { type: 'object', properties: { pattern: str, path: str, glob: str, output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'] }, '-i': { type: 'boolean' }, '-C': int, head_limit: int }, required: ['pattern'] } },
  { name: 'Glob', description: 'Elenca i file che corrispondono a un glob.', input_schema: { type: 'object', properties: { pattern: str, path: str }, required: ['pattern'] } },
  { name: 'Bash', description: 'Esegue un comando bash e restituisce il suo output.', input_schema: { type: 'object', properties: { command: str, description: str, timeout: int }, required: ['command'] } },
  { name: 'Edit', description: 'Sostituisce old_string (unica nel file) con new_string.', input_schema: { type: 'object', properties: { file_path: str, old_string: str, new_string: str, replace_all: { type: 'boolean' } }, required: ['file_path', 'old_string', 'new_string'] } },
  { name: 'Write', description: 'Scrive un file, sovrascrivendolo se esiste.', input_schema: { type: 'object', properties: { file_path: str, content: str }, required: ['file_path'] } },
  // Il motore (2.1.295) consegna il report del subagente solo tramite questa chiamata: è l'ultima azione del run.
  { name: 'SubagentHandback', description: 'Consegna il report finale al chiamante e termina il run. Chiamalo come ultima azione, con il report completo in message.', input_schema: { type: 'object', properties: { message: str }, required: ['message'] } },
]


type Call = { id: string; name: string; json: string }
type Chunk = { kind: 'text' | 'thinking'; index: number; text: string }
const ERR = (text: string) => `[gpt-bridge] ${text}`
const EMPTY = /^\s*(\{\s*\})?\s*$/ // argomenti assenti: '' oppure '{}'

type Spec = { prompt: string; tools: string[] }
// Agenti serviti dalla mod, per tipo: il worker interno più i gemelli letti da agents/*.md di Trinity.
const AGENTS: Record<string, Spec> = { 'gpt-bridge:worker': { prompt: PROMPT, tools: TOOLS.map(t => t.name) } }

// Frontmatter YAML minimo: `chiave: valore`, blocchi `>-` e `|` ripiegati su una riga. Basta per agents/*.md.
const parseFrontmatter = (text: string) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  const fields: Record<string, string> = {}
  let key = ''
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (kv) { key = kv[1]!; fields[key] = /^[>|]-?$/.test(kv[2]!) ? '' : kv[2]! }
    else if (key && /^\s+\S/.test(line)) fields[key] = `${fields[key]} ${line.trim()}`.trim()
  }
  return { fields, body: (m?.[2] ?? text).trim() }
}

export const register: Register = on => {
  let key = ''
  let curl = 'curl'

  on('session.start', async ($, e, next) => {
    key = (await $.process.run(['bash', '-c', 'cat ~/.litellm/master-key.txt'])).stdout.trim()
    // Su Windows il curl nativo parte in 54 ms contro i 156 ms del build MSYS; su Linux `curl` dal PATH.
    const root = await $.env.get('SystemRoot')
    if (root) curl = `${root}\\System32\\curl.exe`
    await $.agent.register({
      name: 'worker',
      description: 'Subagente generico su GPT-5.6 Sol (xhigh) via LiteLLM: secondo parere indipendente, review avversaria, analisi e implementazione con un modello non-Claude.',
      prompt: PROMPT,
      model: MODEL,
      tools: TOOLS.map(t => t.name),
    })
    // Agenti Trinity con `gpt-model:` nel frontmatter → gemello gpt-bridge:<nome>: stesso prompt,
    // descrizione e tool, modello GPT (l'effort viene dal suffisso dell'alias, es. -sol-xhigh).
    // Tool senza schema nella mod (MCP, Agent) vengono scartati: GPT non potrebbe chiamarli.
    const dir = await $.env.get('TRINITY_PLUGIN_DIR')
    if (dir) {
      const out = (await $.process.run(['bash', '-c', 'for f in "$0"/agents/*.md; do printf "\\n===agent:%s\\n" "$(basename "$f" .md)"; cat "$f"; done', dir])).stdout
      for (const chunk of out.split('\n===agent:').slice(1)) {
        const nl = chunk.indexOf('\n')
        const name = chunk.slice(0, nl).trim()
        const { fields, body } = parseFrontmatter(chunk.slice(nl + 1))
        const model = fields['gpt-model']
        if (!model) continue
        const wanted = fields.tools ? fields.tools.split(',').map(s => s.trim()) : TOOLS.map(t => t.name)
        const tools = TOOLS.map(t => t.name).filter(t => wanted.includes(t) || t === 'SubagentHandback')
        AGENTS[`gpt-bridge:${name}`] = { prompt: body, tools }
        await $.agent.register({
          name,
          description: `[GPT ${model}] ${fields.description ?? ''} Usalo solo quando il command o l'utente chiede esplicitamente un modello non-Claude; altrimenti usa trinity:${name}.`,
          prompt: body,
          model,
          tools,
        })
      }
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const type = e.agentId === undefined ? undefined : (await $.agent.list()).find(a => a.id === e.agentId)?.type
    const spec = type ? AGENTS[type] : undefined
    if (!spec) return yield* next(e)

    const toolUses: { name: string; input: unknown }[] = []
    // Tool call per indice di blocco: trattenute fino a fine risposta (vedi `lost`).
    const calls: Record<number, Call> = {}
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: e.model }
    let answer = ''
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn'
    let done = false
    let lost = false // un blocco tool_use ha chiuso senza argomenti
    let maxIndex = -1
    let raw = '' // righe non SSE: corpo di un errore HTTP o stderr di curl

    const setUsage = (u: any, model?: string) => {
      usage.model = model ?? usage.model
      usage.output_tokens = u.output_tokens ?? usage.output_tokens; usage.input_tokens = u.input_tokens ?? usage.input_tokens
      usage.cache_read_input_tokens = u.cache_read_input_tokens ?? usage.cache_read_input_tokens; usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? usage.cache_creation_input_tokens
    }

    // Traduce un evento SSE di /v1/messages nei chunk del motore; aggiorna lo stato.
    const handle = (ev: any): Chunk[] => {
      const i: number = ev.index ?? 0
      if (i > maxIndex) maxIndex = i
      switch (ev.type) {
        case 'message_start': { usage.model = ev.message?.model ?? e.model; return [] }
        case 'content_block_start': { const b = ev.content_block ?? {}
          if (b.type === 'tool_use') { calls[i] = { id: b.id, name: b.name, json: '' }; return [] }
          if (b.type === 'text' && b.text) { answer += b.text; return [{ kind: 'text', index: i, text: b.text }] }
          return [] }
        case 'content_block_delta': { const d = ev.delta ?? {}
          if (d.type === 'text_delta') { answer += d.text; return [{ kind: 'text', index: i, text: d.text }] }
          if (d.type === 'thinking_delta') return [{ kind: 'thinking', index: i, text: d.thinking }]
          if (d.type === 'input_json_delta' && calls[i]) calls[i].json += d.partial_json
          return [] }
        case 'content_block_stop': { const c = calls[i]; if (c && EMPTY.test(c.json)) lost = true; return [] }
        case 'message_delta': { stopReason = ev.delta?.stop_reason ?? stopReason; setUsage(ev.usage ?? {}); done = true; return [] } // LiteLLM mette l'usage completo qui
        case 'error': { const m = ERR(`LiteLLM: ${JSON.stringify(ev.error).slice(0, 500)}`); answer += m; done = true; return [{ kind: 'text', index: i, text: m }] }
        default: return []
      }
    }

    const messages = await $.session.messages({ as: 'api', agentId: e.agentId })
    if (!Array.isArray(messages)) raw = `transcript non leggibile: ${messages.deny}`
    else {
      // SubagentHandback esiste solo quando il motore lo annuncia nel primo messaggio del subagente
      // (modalità auto); altrove GPT sprecherebbe chiamate su un tool assente.
      const handback = JSON.stringify(messages[0]).includes('SubagentHandback(')
      const tools = TOOLS.filter(t => spec.tools.includes(t.name) && (t.name !== 'SubagentHandback' || handback))
      // Riassunto del ragionamento in streaming (chunk `thinking` nel pannello). Con `thinking` nella
      // richiesta LiteLLM ignora il reasoning_effort della config: l'effort va ripetuto qui, letto dal
      // suffisso dell'alias (claude-gpt-…-xhigh). Suffisso sconosciuto: niente thinking, resta la config.
      const effort = e.model.split('-').pop() ?? ''
      const think = ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? { thinking: { type: 'adaptive', summary: 'detailed' }, output_config: { effort } } : {}
      // Affinità di cache: il provider chatgpt di LiteLLM manda al backend l'header `session_id` preso da
      // `litellm_session_id`; senza, usa un uuid nuovo a ogni chiamata e la cache del prefisso si perde
      // (misurato: 3 hit su 4 con la chiave, 1 su 4 senza). Un id per run del subagente.
      const req = { model: e.model, max_tokens: 32000, system: `${spec.prompt}\n\nDirectory di lavoro: ${await $.session.cwd()}`, tools, messages, litellm_session_id: e.agentId, ...think }
      const argv = [curl, '-sS', '-X', 'POST', `${LITELLM}/v1/messages`, '-H', 'content-type: application/json', '-H', 'anthropic-version: 2023-06-01', '-H', `x-litellm-api-key: Bearer ${key}`, '--data-binary', '@-']
      // ponytail: curl via $.process.spawn perché $.http.fetch abortisce a 30 s fissi e non fa streaming;
      // spawn non ha tetto di tempo e il budget dell'hook conta solo il codice qui, non l'attesa dei pezzi.
      const proc = $.process.spawn({ argv: [...argv, '-N'], input: JSON.stringify({ ...req, stream: true }) })
      let buf = ''
      for await (const piece of proc) {
        if (piece.stream === 'stderr') { raw += piece.text; continue }
        buf += piece.text
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) { let ev; try { ev = JSON.parse(line.slice(6)) } catch { continue } for (const c of handle(ev)) yield c }
          else if (line && !line.startsWith('event:') && !line.startsWith(':')) raw += line
        }
      }
      raw += buf

      let final = Object.keys(calls).map(Number).sort((a, b) => a - b).map(i => [i, calls[i]!] as const)
      if (lost) {
        // ponytail: LiteLLM#45348 — in streaming il provider chatgpt manda le tool call parallele senza
        // argomenti. Ripeto SOLO questo passo senza streaming e uso quelle tool call (il testo è già
        // uscito in streaming). Togliere quando LiteLLM rilascia la PR #45356.
        const r = await $.process.run(argv, { stdin: JSON.stringify(req), timeoutMs: 600000 })
        let reply: any = null; try { reply = JSON.parse(r.stdout) } catch {}
        if (Array.isArray(reply?.content)) {
          final = reply.content.filter((b: any) => b.type === 'tool_use').map((b: any, k: number) => [maxIndex + 1 + k, { id: b.id, name: b.name, json: JSON.stringify(b.input ?? {}) }] as const)
          stopReason = reply.stop_reason ?? stopReason; setUsage(reply.usage ?? {}, reply.model); done = true
        } else { final = []; stopReason = 'end_turn'; done = false; raw += `ripiego senza streaming fallito: ${(r.stdout || r.stderr).slice(0, 300)}` }
      }
      for (const [i, c] of final) {
        let input: unknown = {}; try { input = JSON.parse(c.json || '{}') } catch {}
        toolUses.push({ name: c.name, input })
        yield { kind: 'tool', index: i, id: c.id, name: c.name }
        yield { kind: 'input', index: i, json: c.json || '{}' }
      }
    }
    if (!done) { const m = ERR(`LiteLLM senza risposta: ${raw.trim().slice(0, 500)}`); answer += m; yield { kind: 'text', index: 0, text: m } }
    yield { kind: 'stop', stopReason, usage }
    return { turnId: e.turnId, index: e.index, answer, toolUses, stopReason, usage }
  })
}
