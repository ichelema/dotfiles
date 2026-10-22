// Run with: claude plugin test <cartella della mod>
import { describe, expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'
import { forget, formatTurns, ownArgs, parseTurns, rowsOf, sameStart, splitTurns } from '../hooks/forget'
import { promptRows } from '../hooks/transcript'

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
    // prima del primo turno tolto gli oggetti restano quelli del motore, tool_result e handle compresi
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
})
