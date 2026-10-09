import { expect, test } from 'claude-code/testing'

const step = { turnId: 't1', index: 0, model: 'claude-gpt-5-6-sol-xhigh', messageCount: 1, agentId: 'a1' }
// Legge lo stream fino in fondo: i chunk e il valore di ritorno del generatore.
const drain = async (stream: AsyncGenerator<any, any>) => {
  const chunks: any[] = []
  for (;;) { const n = await stream.next(); if (n.done) return { chunks, r: n.value }; chunks.push(n.value) }
}
const agent = (type: string) => ({ value: [{ id: 'a1', type, description: '', status: 'running' }] }) as never
const SSE = [
  'event: message_start', 'data: {"type":"message_start","message":{"model":"claude-gpt-5-6-sol-xhigh","usage":{"input_tokens":0}}}', '',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}', '',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Leggo."}}', '',
  'data: {"type":"content_block_stop","index":0}', '',
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_1","name":"Read","input":{}}}', '',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"file_path\\":"}}', '',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"README.md\\"}"}}', '',
  'data: {"type":"content_block_stop","index":1}', '',
  'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"input_tokens":10,"output_tokens":5}}', '',
  'data: {"type":"message_stop"}', '',
].join('\n')

test('risponde in streaming al turn.step del proprio agente via LiteLLM', async ($, on) => {
  let sent: any
  on('agent.list', () => agent('gpt-bridge:worker'))
  on('session.messages', () => ({ value: [{ role: 'user', content: [{ type: 'text', text: 'ciao' }] }] }) as never)
  on('session.cwd', () => ({ value: 'E:/wd' }) as never)
  on('process.spawn', async function* (_, e) {
    sent = JSON.parse(e.input!)
    const cut = SSE.indexOf('text_delta') + 4 // taglio a metà riga: prova il buffer
    yield { stream: 'stdout', text: SSE.slice(0, cut) }
    yield { stream: 'stdout', text: SSE.slice(cut) }
    return { value: { code: 0, signal: null } }
  })
  on('turn.step', async function* () { throw new Error('non deve arrivare al motore') })
  const { chunks, r } = await drain($.turn.step(step as never))
  expect(sent.model).toBe('claude-gpt-5-6-sol-xhigh')
  expect(sent.stream).toBe(true)
  expect(sent.output_config).toEqual({ effort: 'xhigh' }) // effort dal suffisso dell'alias
  expect(sent.thinking).toEqual({ type: 'adaptive', summary: 'detailed' })
  expect(sent.litellm_session_id).toBe('a1') // affinità di cache per run
  expect(sent.tools.map((t: any) => t.name)).not.toContain('SubagentHandback') // nessun promemoria handback nel primo messaggio
  expect(sent.messages).toHaveLength(1)
  expect(sent.system).toContain('E:/wd')
  expect(chunks.map(c => c.kind)).toEqual(['text', 'tool', 'input', 'stop']) // tool call trattenuta: un solo input a fine risposta
  expect(chunks.find(c => c.kind === 'input').json).toBe('{"file_path":"README.md"}')
  expect(r.answer).toBe('Leggo.')
  expect(r.toolUses).toEqual([{ name: 'Read', input: { file_path: 'README.md' } }])
  expect(r.stopReason).toBe('tool_use')
  expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-gpt-5-6-sol-xhigh' })
})

test('un errore HTTP senza eventi SSE diventa testo visibile e end_turn', async ($, on) => {
  on('agent.list', () => agent('gpt-bridge:worker'))
  on('session.messages', () => ({ value: [{ role: 'user', content: [{ type: 'text', text: 'ciao' }] }] }) as never)
  on('session.cwd', () => ({ value: 'E:/wd' }) as never)
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: '{"error":{"message":"Invalid model name","code":"400"}}' }
    return { value: { code: 0, signal: null } }
  })
  on('turn.step', async function* () { throw new Error('non deve arrivare al motore') })
  const { chunks, r } = await drain($.turn.step(step as never))
  expect(chunks.map(c => c.kind)).toEqual(['text', 'stop'])
  expect(r.answer).toContain('[gpt-bridge]')
  expect(r.answer).toContain('Invalid model name')
  expect(r.stopReason).toBe('end_turn')
})

test('lascia passare i turni degli altri agenti al motore', async ($, on) => {
  on('agent.list', () => agent('Explore'))
  on('turn.step', async function* () { return { turnId: 't1', index: 0, answer: 'motore', toolUses: [], stopReason: 'end_turn', usage: null } })
  const { chunks, r } = await drain($.turn.step(step as never))
  expect(chunks).toEqual([])
  expect(r.answer).toBe('motore')
})

test('tool call parallele senza argomenti: ripete il passo senza streaming (LiteLLM#45348)', async ($, on) => {
  let sent2: any
  on('agent.list', () => agent('gpt-bridge:worker'))
  on('session.messages', () => ({ value: [{ role: 'user', content: [{ type: 'text', text: 'ciao' }] }] }) as never)
  on('session.cwd', () => ({ value: 'E:/wd' }) as never)
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: [
      'data: {"type":"message_start","message":{"model":"claude-gpt-5-6-sol-xhigh","usage":{"input_tokens":0}}}', '',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Cerco."}}', '',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call_a","name":"Glob","input":{}}}', '',
      'data: {"type":"content_block_stop","index":1}', '',
      'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"call_b","name":"Grep","input":{}}}', '',
      'data: {"type":"content_block_stop","index":2}', '',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"input_tokens":10,"output_tokens":5}}', '',
      'data: {"type":"message_stop"}', '',
    ].join('\n') }
    return { value: { code: 0, signal: null } }
  })
  on('process.run', (_, e) => {
    sent2 = JSON.parse(e.init!.stdin!)
    const reply = { model: 'claude-gpt-5-6-sol-xhigh', stop_reason: 'tool_use', usage: { input_tokens: 11, output_tokens: 7 },
      content: [{ type: 'tool_use', id: 'call_c', name: 'Glob', input: { pattern: '**/*.py' } }, { type: 'tool_use', id: 'call_d', name: 'Grep', input: { pattern: 'retain' } }] }
    return { value: { exitCode: 0, stdout: JSON.stringify(reply), stderr: '' } } as never
  })
  on('turn.step', async function* () { throw new Error('non deve arrivare al motore') })
  const { chunks, r } = await drain($.turn.step(step as never))
  expect(sent2.stream).toBeUndefined()
  expect(chunks.map(c => c.kind)).toEqual(['text', 'tool', 'input', 'tool', 'input', 'stop'])
  expect(chunks.filter(c => c.kind === 'tool').map(c => c.id)).toEqual(['call_c', 'call_d'])
  expect(chunks.filter(c => c.kind === 'input').map(c => c.index)).toEqual([3, 4]) // indici dopo l'ultimo blocco streamato (2)
  expect(r.toolUses).toEqual([{ name: 'Glob', input: { pattern: '**/*.py' } }, { name: 'Grep', input: { pattern: 'retain' } }])
  expect(r.answer).toBe('Cerco.')
  expect(r.usage?.output_tokens).toBe(7)
})

test('registra gpt-bridge:<nome> per ogni agente Trinity con gpt-model nel frontmatter', async ($, on) => {
  const registered: any[] = []
  on('env.get', (_, e) => ({ value: e.name === 'TRINITY_PLUGIN_DIR' ? 'E:/trinity' : undefined }) as never)
  on('process.run', (_, e) => {
    if (e.argv[0] === 'bash' && String(e.argv[2]).includes('agents/*.md')) return { value: { exitCode: 0, stderr: '', stdout: [
      '', '===agent:reviewer', '---', 'name: reviewer', 'description: >-', '  Review avversaria', '  in sola lettura.', 'model: fable', 'gpt-model: claude-gpt-5-6-sol-xhigh', 'tools: Read, Grep, Glob, Bash', 'color: red', '---', '', 'Sei un reviewer avversario.', '',
      '', '===agent:deep-reasoner', '---', 'name: deep-reasoner', 'description: Analisi.', 'model: fable', 'gpt-model: claude-gpt-5-6-sol-max', 'effort: max', '---', 'Ragiona a fondo.', '',
      '', '===agent:scoper', '---', 'name: scoper', 'model: haiku', '---', 'Solo Claude.',
    ].join('\n') } } as never
    return { value: { exitCode: 0, stdout: 'sk-test', stderr: '' } } as never
  })
  on('agent.register', (_, e) => { registered.push(e); return { value: {} } as never })
  on('session.start', async (_, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: 'E:/wd' } as never)
  expect(registered.map(a => a.name)).toEqual(['worker', 'reviewer', 'deep-reasoner']) // scoper senza gpt-model: ignorato
  const r = registered.find(a => a.name === 'reviewer')
  expect(r.model).toBe('claude-gpt-5-6-sol-xhigh')
  expect(r.description).toContain('[GPT claude-gpt-5-6-sol-xhigh] Review avversaria in sola lettura.')
  expect(r.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'SubagentHandback'])
  expect(r.prompt).toBe('Sei un reviewer avversario.')
  const d = registered.find(a => a.name === 'deep-reasoner')
  expect(d.model).toBe('claude-gpt-5-6-sol-max') // qualsiasi livello di effort nell'alias
  expect(d.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'SubagentHandback']) // senza tools: tutti quelli con schema
})
