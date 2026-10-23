// Run with: claude plugin test <cartella della mod>
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, SessionMessage } from 'claude-code'
import { fit, forget, formatTurns, ownArgs, parseTurns, rowsOf, sameStart, splitTurns } from '../hooks/forget'
import { hiddenIds, promptRows, reachesBoundary, relinks, type TranscriptRow } from '../hooks/transcript'

const user = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const result = (id: string): SessionMessage => ({
  role: 'user',
  text: '',
  toolUses: [],
  toolResults: [{ tool_use_id: id, text: 'ok', isError: false }],
  handle: `h-${id}`,
})
const bot = (text: string, id?: string): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses: id ? [{ tool_use_id: id, tool: 'Bash', input: {} }] : [],
})

/**
 * Contesto del motore, poi 10 turni: il 4 e l'8 chiamano un tool, il 5 è stato interrotto con Esc,
 * il 6 chiude con una riga di comando.
 */
function conversation(): SessionMessage[] {
  const out = [user('<system-reminder>contesto</system-reminder>')]
  for (let n = 1; n <= 10; n++) {
    out.push(user(`prompt ${n}`))
    if (n === 4 || n === 8) out.push(bot('', `t${n}`), result(`t${n}`))
    if (n === 5) out.push(user('[Request interrupted by user]'))
    out.push(bot(`risposta ${n}`))
    if (n === 6) out.push(user('<command-name>/model</command-name>'))
  }
  return out
}

describe('turn-forget', () => {
  test('parseTurns legge singoli turni, intervalli ed elenchi', () => {
    expect(parseTurns('7-8')).toEqual([[7, 8]])
    expect(parseTurns(' 3, 7-8 ')).toEqual([[3, 3], [7, 8]])
    for (const bad of ['', 'x', '0', '8-7', '7-', '-3']) expect(parseTurns(bad), bad).toBe(undefined)
  })

  test('ownArgs riconosce solo le istruzioni di /compact turn-forget', () => {
    expect(ownArgs('turn-forget')).toBe('')
    expect(ownArgs(' turn-forget 3 7-8 ')).toBe('3 7-8')
    for (const other of [undefined, '', 'tieni il piano', 'turn-forgetful 7-8']) expect(ownArgs(other), String(other)).toBe(undefined)
  })

  test('formatTurns scrive i turni spuntati in ordine, i consecutivi come intervallo', () => {
    expect(formatTurns([8, 3, 5, 4])).toBe('3-5 8')
    expect(formatTurns(new Set([2]))).toBe('2')
    expect(formatTurns([5, 1, 1])).toBe('1 5')
    expect(formatTurns([])).toBe('')
    expect(parseTurns(formatTurns([8, 3, 5, 4]))).toEqual([[3, 5], [8, 8]])
  })

  test('sameStart ritrova i prompt della selezione, anche con turni arrivati dopo', () => {
    const { turns } = splitTurns(conversation())
    expect(sameStart(turns, ['prompt 1', ' prompt  2 '])).toBe(true)
    expect(sameStart(turns, ['prompt 1', 'prompt 3'])).toBe(false)
    expect(sameStart(turns.slice(0, 1), ['prompt 1', 'prompt 2'])).toBe(false)
  })

  test('promptRows prende dal transcript i prompt dopo l\'ultima compattazione', () => {
    const row = (uuid: string, content: unknown, extra: object = {}) => ({ type: 'user', uuid, message: { content }, ...extra })
    const rows = [
      row('vecchio', 'prima della compattazione'),
      row('vecchia-coda', '/compact turn-forget 2', { origin: { kind: 'plugin', name: 'turn-forget' } }),
      { type: 'system', subtype: 'compact_boundary', uuid: 'b' },
      row('riassunto', 'This session is being continued…', { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
      { type: 'attachment', uuid: 'a' },
      row('p2', [{ type: 'text', text: 'ma ho dato il comando' }]),
      row('meta', 'Base directory for this skill', { isMeta: true }),
      row('tool', [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }]),
      row('stop', [{ type: 'text', text: '[Request interrupted by user for tool use]' }]),
      row('cmd', '<command-name>/forget</command-name>'),
      row('coda', '/compact turn-forget 3', { origin: { kind: 'plugin', name: 'turn-forget' } }),
      row('si', 'si', { origin: { kind: 'human' } }),
      { type: 'assistant', uuid: 'r', message: { content: [{ type: 'text', text: 'ok' }] } },
    ]
    expect(promptRows(rows)).toEqual({
      current: [
        { uuid: 'riassunto', text: 'This session is being continued…' },
        { uuid: 'p2', text: 'ma ho dato il comando' },
        { uuid: 'si', text: 'si' },
      ],
      // il primo prompt dopo la compattazione è un riassunto: il prompt di prima non vi si abbina
      earlier: [{ uuid: 'vecchio' }],
    })
  })

  test('promptRows abbina la storia sopra ogni compattazione ai turni del contesto, in ordine', () => {
    const row = (uuid: string, text: string) => ({ type: 'user', uuid, message: { content: text } })
    const cut = { type: 'system', subtype: 'compact_boundary' }
    // /forget 2 toglie «b» (con «si» uguale al turno dopo), poi /forget 1 toglie «a»; le copie hanno altri uuid
    const rows = [
      row('a0', 'a'), row('b0', 'b'), row('s0', 'si'), row('c0', 'c'),
      cut, row('a1', 'a'), row('s1', 'si'), row('c1', 'c'), row('d1', 'd'),
      cut, row('s2', 'si'), row('c2', 'c'), row('d2', 'd'), row('e2', 'e'),
    ]
    expect(promptRows(rows)).toEqual({
      current: [{ uuid: 's2', text: 'si' }, { uuid: 'c2', text: 'c' }, { uuid: 'd2', text: 'd' }, { uuid: 'e2', text: 'e' }],
      earlier: [
        { uuid: 'a0' }, { uuid: 'b0' }, { uuid: 's0', turn: 1 }, { uuid: 'c0', turn: 2 },
        { uuid: 'a1' }, { uuid: 's1', turn: 1 }, { uuid: 'c1', turn: 2 }, { uuid: 'd1', turn: 3 },
      ],
    })
  })

  test('rowsOf dà la casella anche alla riga di prima di un turno del contesto, le altre restano fuori', () => {
    const rows = rowsOf({
      current: [{ uuid: 'c1', text: 'uno' }, { uuid: 'c3', text: 'tre' }],
      earlier: [{ uuid: 'o1', turn: 1 }, { uuid: 'o2' }, { uuid: 'o3', turn: 2 }],
    })
    expect(['c1', 'c3', 'o1', 'o3'].map(id => rows.turns.get(id))).toEqual([1, 2, 1, 2])
    expect(rows.turns.has('o2')).toBe(false)
    expect(rows.outside.has('o2')).toBe(true)
    expect(rows.texts).toEqual(['uno', 'tre'])
  })

  test('rowsOf riconosce una riga anche con l\'id che il motore deriva dopo un messaggio a più blocchi', () => {
    const rows = rowsOf({
      current: [{ uuid: '43a0d710-e13b-4847-b247-d08fd3681144', text: 'prova' }],
      earlier: [{ uuid: '3a5ea628-8bca-4d43-8ce7-6c9c6d5ceda6' }],
    })
    expect(rows.turns.get('43a0d710-e13b-4847-b247-000000000000')).toBe(1)
    expect(rows.outside.has('3a5ea628-8bca-4d43-8ce7-000000000000')).toBe(true)
    // gli altri blocchi dello stesso messaggio restano senza casella
    expect(rows.turns.has('43a0d710-e13b-4847-b247-000000000001')).toBe(false)
  })

  test('splitTurns numera i prompt e lascia fuori il contesto iniziale', () => {
    const { preamble, turns } = splitTurns(conversation())
    expect(preamble.map(m => m.text)).toEqual(['<system-reminder>contesto</system-reminder>'])
    expect(turns.length).toBe(10)
    expect(turns[3]!.length).toBe(4) // prompt, tool_use, tool_result, risposta
    expect(turns[5]!.at(-1)!.text).toBe('<command-name>/model</command-name>')
  })

  test('forget toglie i turni 7-8 con le loro chiamate tool e lascia identico il resto', () => {
    const all = conversation()
    const r = forget(all, [[7, 8]])
    if (!('messages' in r)) throw new Error(r.skip)
    expect(r.messages.filter(m => m.text.startsWith('prompt ')).map(m => m.text)).toEqual([
      'prompt 1', 'prompt 2', 'prompt 3', 'prompt 4', 'prompt 5', 'prompt 6', 'prompt 9', 'prompt 10',
    ])
    expect(r.messages.some(m => m.toolUses.some(u => u.tool_use_id === 't8'))).toBe(false)
    expect(r.messages.some(m => m.toolResults?.some(x => x.tool_use_id === 't8'))).toBe(false)
    expect(r.messages.some(m => m.toolUses.some(u => u.tool_use_id === 't4'))).toBe(true)
    // prima del primo turno tolto gli oggetti restano quelli del motore, tool_result e handle compresi:
    // senza handle il motore perderebbe le righe agganciate al risultato e la cache da lì in poi
    expect(r.messages[0]).toBe(all[0])
    const result4 = (list: readonly SessionMessage[]) => list.find(m => m.toolResults?.some(x => x.tool_use_id === 't4'))
    expect(result4(r.messages)).toBe(result4(all))
  })

  test('dopo il primo turno tolto i tool_result perdono il loro handle', () => {
    const all = conversation()
    const r = forget(all, [[3, 3], [9, 9]])
    if (!('messages' in r)) throw new Error(r.skip)
    const kept4 = r.messages.find(m => m.toolResults?.some(x => x.tool_use_id === 't4'))!
    expect(kept4.handle).toBe(undefined)
    expect(kept4.toolResults).toEqual([{ tool_use_id: 't4', text: 'ok', isError: false }])
    // gli altri messaggi dopo il turno tolto restano quelli del motore
    expect(r.messages.find(m => m.text === 'risposta 4')).toBe(all.find(m => m.text === 'risposta 4'))
  })

  test('relinks ricollega le copie dei tool_result dopo l\'ultimo confine alla copia della riga a cui puntavano', () => {
    const row = (uuid: string, parentUuid: string | null, type: string, content: unknown): TranscriptRow => ({ uuid, parentUuid, type, message: { content } })
    const use = (id: string) => [{ type: 'tool_use', id, name: 'Bash', input: {} }]
    const res = (id: string) => [{ type: 'tool_result', tool_use_id: id, content: 'ok' }]
    const rows: (TranscriptRow | undefined)[] = [
      row('p1', null, 'user', 'prompt 1'),
      row('a1', 'p1', 'assistant', use('t1')),
      row('r1', 'a1', 'user', res('t1')),
      { type: 'system', subtype: 'compact_boundary', uuid: 'b', parentUuid: null },
      row('p1c', 'b', 'user', 'prompt 1'),
      row('a1c', 'p1c', 'assistant', use('t1')),
      // la copia tenuta col suo handle: punta al tool_use originale, prima del confine
      row('r1c', 'a1', 'user', res('t1')),
      row('x1c', 'r1c', 'assistant', 'fatto'),
      undefined, // una riga che non si legge
      // un tool_result nuovo punta già dopo il confine: resta com'è
      row('a2', 'x1c', 'assistant', use('t2')),
      row('r2', 'a2', 'user', res('t2')),
      row('x2', 'r2', 'assistant', 'fatto'),
    ]
    expect(relinks(rows)).toEqual([{ index: 6, from: 'a1', to: 'a1c' }])
    expect(reachesBoundary(rows)).toBe(false)
    rows[6]!.parentUuid = 'a1c'
    expect(reachesBoundary(rows)).toBe(true)
    expect(relinks(rows)).toEqual([])
  })

  test('relinks ricollega i risultati di due chiamate parallele ciascuno alla copia della sua chiamata', () => {
    const row = (uuid: string, parentUuid: string | null, type: string, content: unknown): TranscriptRow => ({ uuid, parentUuid, type, message: { content } })
    const use = (id: string) => [{ type: 'tool_use', id, name: 'Bash', input: {} }]
    const res = (id: string) => [{ type: 'tool_result', tool_use_id: id, content: 'ok' }]
    // come le scrive il motore: B è figlia di A, il risultato di ogni chiamata è figlio della sua riga
    const rows: TranscriptRow[] = [
      row('p', null, 'user', 'prompt'),
      row('aA', 'p', 'assistant', use('A')),
      row('aB', 'aA', 'assistant', use('B')),
      row('rA', 'aA', 'user', res('A')),
      row('rB', 'aB', 'user', res('B')),
      { type: 'system', subtype: 'compact_boundary', uuid: 'b', parentUuid: null },
      row('pc', 'b', 'user', 'prompt'),
      row('aAc', 'pc', 'assistant', use('A')),
      row('aBc', 'aAc', 'assistant', use('B')),
      row('rAc', 'aA', 'user', res('A')),
      row('rBc', 'aB', 'user', res('B')),
    ]
    expect(relinks(rows)).toEqual([
      { index: 9, from: 'aA', to: 'aAc' },
      { index: 10, from: 'aB', to: 'aBc' },
    ])
  })

  test('senza compattazioni relinks non cambia niente e la catena è intera', () => {
    const rows: TranscriptRow[] = [
      { uuid: 'p', parentUuid: null, type: 'user', message: { content: 'ciao' } },
      { uuid: 'a', parentUuid: 'p', type: 'assistant', message: { content: 'ok' } },
    ]
    expect(relinks(rows)).toEqual([])
    expect(reachesBoundary(rows)).toBe(true)
    expect(hiddenIds(rows)).toEqual([])
  })

  test('hiddenIds nasconde la storia sopra l\'ultimo confine e le chiamate tool copiate, non i messaggi copiati', () => {
    const row = (uuid: string, type: string, content: unknown): TranscriptRow => ({ uuid, type, message: { content } })
    const use = (id: string) => [{ type: 'tool_use', id, name: 'Bash', input: {} }]
    const res = (id: string) => [{ type: 'tool_result', tool_use_id: id, content: 'ok' }]
    const rows: (TranscriptRow | undefined)[] = [
      row('p1', 'user', 'prompt 1'),
      row('a1', 'assistant', use('t1')),
      row('r1', 'user', res('t1')),
      row('p2', 'user', 'prompt 2'),
      row('a2', 'assistant', use('t2')),
      row('r2', 'user', res('t2')),
      { type: 'system', subtype: 'compact_boundary', uuid: 'b' },
      row('p1c', 'user', 'prompt 1'),
      row('a1c', 'assistant', use('t1')),
      row('r1c', 'user', res('t1')),
      undefined, // una riga che non si legge
      row('a3', 'assistant', use('t3')),
    ]
    const hidden = new Set(hiddenIds(rows))
    for (const id of ['p1', 'a1', 'r1', 'p2', 'a2', 'r2', 'b', 'collapsed-a1', 'collapsed-a2', 't2']) expect(hidden.has(id)).toBe(true)
    // il gruppo della chiamata copiata ha l'id della copia: il motore lo disegna al posto dell'originale
    expect(hidden.has('collapsed-a1c')).toBe(true)
    expect(hidden.has('t1')).toBe(true)
    // i messaggi copiati e le chiamate nuove restano
    for (const id of ['p1c', 'a1c', 'r1c', 'a3', 'collapsed-a3', 't3']) expect(hidden.has(id)).toBe(false)
  })

  test('forget non tocca nulla per un turno inesistente o una chiamata tool spezzata', () => {
    expect(forget(conversation(), [[11, 11]])).toEqual({ skip: 'il turno 11 non esiste: la conversazione ha 10 turni' })
    // un prompt finito tra un tool_use e il suo tool_result
    const split = [user('p1'), bot('', 'a'), user('p2 in coda'), result('a'), bot('fatto')]
    expect('skip' in forget(split, [[2, 2]])).toBe(true)
  })

  test('senza una rimozione di /forget gli hook SessionStart girano come sempre', async ($, on) => {
    let reached = 0
    on('classic.SessionStart', () => {
      reached++
      return {}
    })
    await $.classic.SessionStart({ source: 'compact' } as never)
    await $.classic.SessionStart({ source: 'startup' } as never)
    expect(reached).toBe(2)
  })

  test('fit tiene il testo su una riga e lo taglia alla larghezza', () => {
    expect(fit('due\n  righe', 20)).toBe('due righe')
    expect(fit('abcdefghij', 5)).toBe('abcd…')
  })

  /** Il motore sotto la mod per il pannello: i prompt da prompts.mjs, e quello che la mod apre, chiude, esegue. */
  function engine(on: On) {
    const clock = mock.clock(on)
    mock.env(on, { CLAUDE_CONFIG_DIR: '/cfg' })
    const seen = { opened: [] as string[], closed: [] as string[], ran: [] as string[], logs: [] as string[] }
    const prompts = { current: [{ uuid: 'u1', text: 'prima domanda' }, { uuid: 'u2', text: 'seconda\ndomanda' }, { uuid: 'u3', text: 'terza' }], earlier: [] }
    on('session.id', () => ({ value: 'sessione' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(prompts), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.open', (_, e) => {
      seen.opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    on('ui.close', (_, e) => {
      seen.closed.push(e.id)
      return { value: undefined }
    })
    on('ui.log', (_, e) => {
      seen.logs.push(e.text)
      return { value: undefined }
    })
    on('command.run', { command: 'compact' }, (_, e) => {
      seen.ran.push(`/compact ${e.args}`)
      return {}
    })
    return { clock, seen }
  }

  const PANE = {
    plugin: 'turn-forget',
    component: 'Pane',
    requestId: 'forget',
    surface: 'terminal',
    props: { title: 'forget', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as const

  /** `/forget tui` scritto nel composer di uno schermo intero largo 160 colonne. */
  const TUI = { command: 'forget', args: 'tui', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const

  test('/forget tui apre il pannello coi turni del contesto; [forget] toglie i turni spuntati e lo chiude', async ($, on) => {
    const { clock, seen } = engine(on)
    await $.command.run(TUI)
    await clock.settle()
    expect(seen.opened).toEqual(['forget'])
    const ui = await $.ui.mount(PANE)
    expect((await ui.find({ type: 'Text', text: /3 turni nel contesto/ }))?.text).toBe('3 turni nel contesto')
    expect((await ui.find({ key: 'vai:2' }))?.text).toBe('2 seconda domanda')
    await ui.press({ key: 'spunta:2' })
    await ui.press({ key: 'spunta:3' })
    expect((await ui.find({ key: 'spunta:2' }))?.text).toBe('[x]')
    expect((await ui.find({ type: 'Text', text: /spuntati/ }))?.text).toBe('spuntati: 2-3')
    // un secondo clic toglie la spunta
    await ui.press({ key: 'spunta:3' })
    expect((await ui.find({ key: 'spunta:3' }))?.text).toBe('[ ]')
    await ui.press({ key: 'forget' })
    await clock.settle()
    expect(seen.ran).toEqual(['/compact turn-forget 2'])
    expect(seen.closed).toEqual(['forget'])
    await ui.unmount()
  })

  test('[annulla] chiude il pannello senza togliere nulla; [forget] senza spunte non toglie nulla', async ($, on) => {
    const { clock, seen } = engine(on)
    await $.command.run(TUI)
    await clock.settle()
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'forget' })
    await clock.settle()
    expect(seen.ran).toEqual([])
    expect(seen.logs).toContain('nessun turno spuntato nel pannello')
    await ui.press({ key: 'spunta:1' })
    await ui.press({ key: 'annulla' })
    await clock.settle()
    expect(seen.ran).toEqual([])
    expect(seen.closed).toEqual(['forget'])
    expect(seen.logs).toContain('nessun turno tolto')
    await ui.unmount()
  })
})
