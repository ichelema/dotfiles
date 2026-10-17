import type { On, PluginOptions } from 'claude-code'

// prismantis is optional: its noun, as its README declares it for other mods.
declare module 'claude-code' {
  interface EngineInterface {
    prismantis: {
      markdown: (args: { surface: RenderSurface; text: string; columns: number }) => Promise<RenderElement | undefined>
    }
  }
}

/**
 * aside: a read-only side chat beside the transcript.
 *
 * `/aside [question]` opens the pane (focused when the composer is empty);
 * Tab puts the focus ring on the pane's input, Enter asks, Esc hands the keys
 * back to the composer, ctrl+x tab focuses the pane again.
 *
 * Each question is a `$.model.fork` over the session's own transcript as
 * of the last completed turn: off the transcript, sharing the main thread's
 * prompt cache; it answers during a later turn too, without seeing the turn
 * in flight. A fork takes exactly one user message, so the side chat's own
 * history is rendered into each prompt.
 *
 * The fork's own tool calls are denied, so it looks at the code through a
 * text protocol: a reply holding `<aside-tool>{"tool":"Read",...}</aside-tool>`
 * runs that call through `$.tool.call` (Read, Grep or Glob only, under the
 * session's permission rules) and forks again with the result appended, up
 * to MAX_LOOKUPS times. A plugin's `$.tool.call` leaves no transcript rows.
 *
 * Until the session's first turn has completed there is no snapshot to fork
 * (`$.model.fork` resolves null at once). Then, with `liveFallback` on, the
 * question is answered by `$.model.complete` over the text of
 * `$.session.messages()`: immediate, uncached, without the session's system
 * prompt, and marked "live" in the pane. With it off, the question queues
 * and a fork answers it when the turn ends.
 *
 * What this module calls on `$` (the static listing `claude plugin validate`
 * prints): command.register, model.complete, model.fork, session.messages,
 * tool.call, ui.close, ui.invalidate, ui.open, ui.resolve. All reads and
 * drawing: no fs, process, http, store or prompt verbs, and tool.call only
 * for READ_TOOLS, so the mod reads the working tree but cannot change it,
 * reach the network, or touch the main thread's prompt.
 */

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

type Exchange = {
  q: string
  a: string | null
  askedAt: number
  ms?: number
  note?: string
  kind?: 'fork' | 'live'
  queued?: true
}

type Host = {
  fork: (prompt: string) => Promise<{ isAnswered: true; text: string; usage: Usage } | { isAnswered: false; reason: string }>
  messages: () => Promise<readonly { role: 'user' | 'assistant'; text: string }[]>
  complete: (prompt: string) => Promise<{ isAnswered: true; text: string } | { isAnswered: false; reason: string }>
  invalidate: () => void
  open: () => Promise<unknown>
  close: () => Promise<void>
  now: () => number
  tool: (input: Record<string, unknown>) => Promise<string>
}

export const PANE_ID = 'aside'
export const DEFAULTS = { liveFallback: true, liveModel: 'haiku', maxHistory: 8 } as const
export const LIVE_TRANSCRIPT_CHARS = 60000
// The trust boundary: the model's reply picks the tool, so only these run.
export const READ_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob']
export const MAX_LOOKUPS = 6
export const MAX_LOOKUP_CHARS = 20000
const TOOL_RE = /<aside-tool>([\s\S]*?)<\/aside-tool>/
const LIVE_SYSTEM =
  'You answer read-only side questions about a Claude Code session from its transcript. No tools; do not continue the task; answer concisely in markdown: only what the question asks.'

export function register(on: On, options: PluginOptions = {}) {
  const liveFallback = typeof options.liveFallback === 'boolean' ? options.liveFallback : DEFAULTS.liveFallback
  const liveModel = typeof options.liveModel === 'string' && options.liveModel !== '' ? options.liveModel : DEFAULTS.liveModel
  const maxHistory =
    typeof options.maxHistory === 'number' && options.maxHistory >= 1 ? Math.floor(options.maxHistory) : DEFAULTS.maxHistory

  let host: Host | null = null
  let history: Exchange[] = []
  let queued: Exchange[] = []
  let inFlight = 0

  // `steps` absent: the live completion, which gets no lookups.
  const promptOf = (question: string, steps?: readonly string[]): string => {
    const prior = history
      .filter(x => x.a !== null && x.kind !== undefined)
      .slice(-maxHistory)
      .map(x => `Q: ${x.q}\nA: ${x.a}`)
      .join('\n\n')
    return [
      'This is a read-only side question about the conversation above. Answer from the transcript so far.',
      steps === undefined
        ? 'Do not use tools, do not propose edits, do not continue the main task; answer concisely in markdown: only what the question asks.'
        : 'Do not propose edits, do not continue the main task; answer concisely in markdown: only what the question asks.\n' +
          'Your own tool calls are denied here. To read a file or search the code, reply with nothing but one line such as ' +
          '<aside-tool>{"tool":"Read","file_path":"src/x.ts"}</aside-tool> (Read, Grep or Glob, with their usual parameters); ' +
          `its result comes back in the next message. At most ${MAX_LOOKUPS} lookups.`,
      prior === '' ? '' : `Earlier side questions and their answers:\n\n${prior}`,
      `Side question: ${question}`,
      steps === undefined || steps.length === 0 ? '' : `Your lookups so far:\n\n${steps.join('\n\n')}`,
    ]
      .filter(part => part !== '')
      .join('\n\n')
  }

  async function answerLive(h: Host, entry: Exchange): Promise<void> {
    const messages = await h.messages()
    if (messages.length === 0) {
      entry.a = '(nothing to ask about yet: the transcript is empty)'
      return
    }
    let rendered = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n')
    if (rendered.length > LIVE_TRANSCRIPT_CHARS) rendered = `…${rendered.slice(-LIVE_TRANSCRIPT_CHARS)}`
    const r = await h.complete(`Transcript so far:\n\n${rendered}\n\n${promptOf(entry.q)}`)
    if (!r.isAnswered) {
      entry.a = `(no answer: ${r.reason})`
      return
    }
    entry.a = r.text
    entry.kind = 'live'
    entry.note = `${rendered.length} chars of transcript sent uncached`
  }

  async function lookup(h: Host, raw: string): Promise<string> {
    let input: unknown
    try {
      input = JSON.parse(raw)
    } catch {
      return 'error: the lookup is not valid JSON'
    }
    if (typeof input !== 'object' || input === null || !READ_TOOLS.includes(String((input as { tool?: unknown }).tool)))
      return `error: only ${READ_TOOLS.join(', ')} are available here`
    try {
      const text = await h.tool(input as Record<string, unknown>)
      return text.length > MAX_LOOKUP_CHARS ? `${text.slice(0, MAX_LOOKUP_CHARS)}\n… (truncated)` : text
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // Resolves false when there is nothing to fork yet, true once `entry` is answered.
  async function answerFork(h: Host, entry: Exchange): Promise<boolean> {
    const steps: string[] = []
    let read = 0
    let fresh = 0
    let out = 0
    for (;;) {
      const r = await h.fork(promptOf(entry.q, steps))
      if (!r.isAnswered) {
        if (r.reason === 'nothing-to-fork' && steps.length === 0) return false
        entry.a = `(no answer: ${r.reason})`
        return true
      }
      read += r.usage.cache_read_input_tokens
      fresh += r.usage.input_tokens + r.usage.cache_creation_input_tokens
      out += r.usage.output_tokens
      const call = TOOL_RE.exec(r.text)
      if (call === null || steps.length >= MAX_LOOKUPS) {
        entry.a = call === null ? r.text : `(stopped after ${MAX_LOOKUPS} lookups without an answer)`
        entry.kind = 'fork'
        entry.note = `read ${read} · new ${fresh} · out ${out}${steps.length > 0 ? ` · ${steps.length} lookups` : ''}`
        return true
      }
      steps.push(`${call[0]}\n<aside-result>\n${await lookup(h, call[1] ?? '')}\n</aside-result>`)
    }
  }

  function run(h: Host, entry: Exchange): void {
    inFlight += 1
    void answerFork(h, entry)
      .then(async answered => {
        if (answered) return
        if (liveFallback) {
          await answerLive(h, entry)
          return
        }
        entry.queued = true
        queued.push(entry)
      })
      .catch((err: unknown) => {
        entry.a = `(no answer: ${err instanceof Error ? err.message : String(err)})`
      })
      .then(() => {
        if (entry.a !== null) entry.ms = h.now() - entry.askedAt
        inFlight -= 1
        h.invalidate()
      })
  }

  function ask(question: string): void {
    const h = host
    const q = question.trim()
    if (!h || q === '') return
    const entry: Exchange = { q, a: null, askedAt: h.now() }
    history = [...history, entry]
    h.invalidate()
    run(h, entry)
  }

  on('session.start', async ($, e, next) => {
    host = {
      fork: prompt => $.model.fork({ prompt }),
      messages: () => $.session.messages(),
      // ponytail: 64000 is the API's ceiling (absent means 1024); a liveModel with a lower output limit gets the call refused, then pass its own limit.
      complete: prompt => $.model.complete({ model: liveModel, maxTokens: 64000, system: LIVE_SYSTEM, prompt }),
      invalidate: () => $.ui.invalidate('ui.render'),
      open: () => $.ui.open({ id: PANE_ID, title: 'aside', focus: true }),
      close: () => $.ui.close({ id: PANE_ID }),
      now: () => Date.now(), // $.clock.now() is async since 2.1.302
      tool: async input => {
        const r = await $.tool.call(input as never)
        return r.deny !== undefined ? `denied: ${r.deny}` : (r.text ?? '')
      },
    }
    await $.command.register({
      name: 'aside',
      description: 'Read-only side chat about this session (opens a pane; Tab focuses its input)',
      argumentHint: '[question]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'aside' }, async ($, e, next) => {
    if (!host) return next(e)
    await host.open()
    ask(e.args)
    return {}
  })

  // Questions that found no snapshot (liveFallback off) are answered by a
  // fork as soon as the turn in flight ends.
  on('turn.complete', ($, e, next) => {
    const h = host
    const waiting = queued
    queued = []
    if (h) {
      for (const entry of waiting) {
        entry.queued = undefined
        run(h, entry)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const { Box, Text, Input, Button, Markdown } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns - 1)
    const shown = history.slice(-maxHistory)
    // Answers draw as the transcript does: prismantis when present, else the surface's own Markdown.
    const answers = await Promise.all(
      shown.map(async x => {
        if (x.a === null || x.kind === undefined) return null
        try {
          const drawn = await $.prismantis.markdown({ surface: e.surface, text: x.a, columns: width - 7 })
          if (drawn) return drawn
        } catch {} // prismantis not installed
        return Markdown({ text: x.a })
      }),
    )
    const rows = shown.map((x, i) =>
      Box({
        key: `x${i}`,
        flexDirection: 'column',
        marginTop: i === 0 ? 0 : 1,
        width,
        children: [
          Text({ bold: true, color: 'cyan', wrap: 'wrap', children: `you: ${x.q}` }),
          x.a === null
            ? Text({ dimColor: true, children: x.queued ? 'aside: waiting for this turn to end…' : 'aside: thinking…' })
            : answers[i]
              ? Box({
                  flexDirection: 'row',
                  children: [
                    Text({ children: 'aside: ' }),
                    Box({ flexDirection: 'column', flexGrow: 1, children: [answers[i]] }),
                  ],
                })
              : Text({ wrap: 'wrap', children: `aside: ${x.a}` }),
          x.a !== null && x.ms !== undefined
            ? Text({ dimColor: true, children: `${x.kind ?? 'error'} · ${x.ms} ms${x.note ? ` · ${x.note}` : ''}` })
            : null,
        ],
      }),
    )
    const header =
      history.length === 0
        ? 'Ask about the session so far. Read-only: it may Read/Grep/Glob, nothing goes into the main thread.'
        : `${history.length} question${history.length === 1 ? '' : 's'}${inFlight ? ` · ${inFlight} pending` : ''}`
    return Box({
      flexDirection: 'column',
      width,
      children: [
        Text({ dimColor: true, children: header }),
        ...rows,
        Box({
          marginTop: 1,
          flexDirection: 'column',
          children: [
            Input({
              key: 'q',
              label: '> ',
              placeholder: e.props.isFocused ? 'Tab to focus, type, Enter to ask, Esc to leave' : 'ctrl+x tab focuses the pane',
              submitLabel: 'ask',
              onSubmit: () => undefined,
            }),
            Box({
              flexDirection: 'row',
              gap: 1,
              children: [
                Button({ key: 'clear', label: 'Clear', onPress: () => undefined }),
                Button({ key: 'close', label: 'Close', onPress: () => undefined }),
              ],
            }),
          ],
        }),
      ],
    })
  })

  // The pane's events are answered here rather than in the element closures:
  // a closure handle belongs to one drawing, and a submit that lands during a
  // redraw is dropped by core ("no handler is held under handle N"), while the
  // hook still sees the event and its value.
  on('ui.input', { plugin: 'aside', element: 'q' }, ($, e, next) => {
    if (e.kind !== 'submit') return next(e)
    ask(e.value)
    return { element: e.element, value: e.value }
  })

  on('ui.press', { plugin: 'aside' }, ($, e, next) => {
    if (e.element === 'clear') {
      history = []
      host?.invalidate()
      return { element: e.element }
    }
    if (e.element === 'close') {
      void host?.close()
      return { element: e.element }
    }
    return next(e)
  })
}
