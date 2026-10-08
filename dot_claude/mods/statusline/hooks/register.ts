import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

// Stato pubblicato dalla mod jev-skill-suggestion (stessa dichiarazione nel suo modulo).
declare module 'claude-code' {
  interface PluginState {
    'jev-skill-suggestion': { status: string }
  }
}

// Porta in-process di ~/.claude/statusline.sh: la mod calcola la riga e la mette in
// CLAUDE_STATUSLINE; la statusline nativa la stampa e basta (niente jq). Saltati rispetto allo script:
// il segmento extra_usage (serve l'API OAuth), il check aggiornamenti upstream
// e il titolo della sessione padre nei fork.

const C = {
  blue: '\x1b[38;2;0;153;255m',
  orange: '\x1b[38;2;255;176;85m',
  green: '\x1b[38;2;0;160;0m',
  cyan: '\x1b[38;2;46;149;153m',
  red: '\x1b[38;2;255;85;85m',
  yellow: '\x1b[38;2;230;200;0m',
  purple: '\x1b[38;2;167;139;250m',
  white: '\x1b[38;2;220;220;220m',
  dim: '\x1b[38;2;150;157;171m',
}
const paint = (color: string, s: string) => `${color}${s}\x1b[0m`
const SEP = ` ${paint(C.dim, '|')} `

// ponytail: TTL fisso, l'API delle mod non espone prompt_cache.ttl; 5 * 60_000 se la sessione usa la cache da 5 minuti
const CACHE_TTL_MS = 3_600_000
const REFRESH_MS = 30_000
// git diff costa ~0,7 s su MSYS2: è la voce più cara della barra, quindi gira al massimo ogni 2 minuti.
const GIT_STAT_MS = 120_000
const TITLE_MS = 60_000

export type Data = {
  ponytail?: string
  model: string
  modelId: string
  effort?: string
  fast: boolean
  cwd: string
  branch?: string
  stat?: { add: number; del: number }
  title?: string
  tokens: number
  window: number
  cacheRead: number
  cacheCreate: number
  lastStepAt?: number
  rateLimits: readonly SessionRateLimit[]
}

export const fmtTokens = (n: number) => {
  if (n >= 1_000_000) {
    const v = Math.floor((n + 50_000) / 100_000)
    return v % 10 === 0 ? `${v / 10}m` : `${(v / 10).toFixed(1)}m`
  }
  return n >= 1000 ? `${Math.floor((n + 500) / 1000)}k` : `${n}`
}

const usageColor = (pct: number) => (pct >= 90 ? C.red : pct >= 70 ? C.orange : pct >= 50 ? C.yellow : C.green)

// Claude Code non conosce la finestra dei modelli via gateway: override per model id.
export const windowFor = (id: string, window: number) => {
  const m = id.toLowerCase()
  if (m.includes('[1m]')) return 1_000_000
  if (/gpt-5[.-]6-sol/.test(m)) return 370_000
  if (/gpt-5[.-][345]|deepseek.*v4/.test(m)) return 1_000_000
  return window || 200_000
}

const EFFORT: Record<string, [string, string]> = {
  low: [C.dim, 'Low'],
  medium: [C.orange, 'Medium'],
  high: [C.green, 'High'],
  xhigh: [C.purple, 'XHigh'],
  max: [C.red, 'Max'],
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const limit = (label: string, l: SessionRateLimit | undefined, withDay: boolean) => {
  if (!l) return `${paint(C.white, label)} ${paint(C.dim, '-')}`
  const pct = Math.round(l.percentUsed)
  let s = `${paint(C.white, label)} ${paint(usageColor(pct), `${pct}%`)}`
  const at = l.resetsAt ? new Date(l.resetsAt) : undefined
  if (at && !Number.isNaN(at.getTime()))
    s += ` ${paint(C.dim, `@${withDay ? `${MONTHS[at.getMonth()]} ${at.getDate()}, ` : ''}${hhmm(at)}`)}`
  return s
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s)

export const line = (d: Data, now: number) => {
  const out: string[] = []
  if (d.ponytail && d.ponytail !== 'off')
    out.push(paint(C.green, d.ponytail === 'full' ? '[PONYTAIL]' : `[PONYTAIL:${d.ponytail.toUpperCase()}]`))

  const effort = d.effort ?? 'medium'
  const [color, label] = EFFORT[effort] ?? [C.green, effort.charAt(0).toUpperCase() + effort.slice(1)]
  const model = d.model.replace(/\s*\(([0-9.]*[kKmM]*) context\)/, ' $1')
  out.push(`${paint(C.blue, model)} ${paint(color, label)}${d.fast ? ` ${paint(C.yellow, '⚡')}` : ''}`)

  const dir = d.cwd.replace(/\\/g, '/').replace(/\/$/, '').split('/').pop()
  if (dir) {
    let s = paint(C.cyan, dir)
    if (d.branch) s += paint(C.dim, '@') + paint(C.green, d.branch)
    if (d.stat)
      s += ` ${paint(C.dim, '(')}${paint(C.green, `+${d.stat.add}`)} ${paint(C.red, `-${d.stat.del}`)}${paint(C.dim, ')')}`
    out.push(s)
  }

  if (d.title) out.push(`${paint(C.purple, 'Session:')} ${paint(C.white, truncate(d.title, 30))}`)

  const window = windowFor(d.modelId, d.window)
  const pct = Math.floor((d.tokens * 100) / window)
  out.push(
    `${paint(C.orange, `${fmtTokens(d.tokens)}/${fmtTokens(window)}`)} ${paint(C.dim, '(')}${paint(C.green, `${pct}%`)}${paint(C.dim, ')')}`,
  )

  const cached = d.cacheRead + d.cacheCreate
  if (cached > 0) {
    const hit = Math.floor((d.cacheRead * 100) / cached)
    const hitColor = hit >= 90 ? C.green : hit >= 70 ? C.yellow : C.red
    let s = `${paint(C.dim, 'cache')} ${paint(C.cyan, `${fmtTokens(d.cacheRead)}↓`)}${paint(C.dim, '/')}${paint(C.purple, `${fmtTokens(d.cacheCreate)}↑`)} ${paint(C.dim, '(')}${paint(hitColor, `${hit}%`)}${paint(C.dim, ')')}`
    if (d.lastStepAt !== undefined) {
      const left = Math.floor((d.lastStepAt + CACHE_TTL_MS - now) / 1000)
      const ttl = CACHE_TTL_MS / 1000
      if (left <= 0) s += ` ${paint(C.red, '⏳scaduta')}`
      else {
        const ttlColor = left > ttl / 2 ? C.green : left > ttl / 5 ? C.yellow : C.red
        s += ` ${paint(ttlColor, `⏳${left >= 60 ? `${Math.floor(left / 60)}m` : `${left}s`}`)}`
      }
    }
    out.push(s)
  }

  out.push(limit('5h', d.rateLimits.find(l => l.kind === 'five_hour'), false))
  out.push(limit('7d', d.rateLimits.find(l => l.kind === 'seven_day'), true))
  return out.join(SEP)
}

// session.model() dà l'id ("claude-opus-5-5[1m]"): nome leggibile come display_name.
export const prettyModel = (id: string) => {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i)
  if (!m) return id
  return `${m[1]!.charAt(0).toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}${m[4] ? ' 1M' : ''}`
}

// ── Stato della sessione (un processo Claude Code = una sessione principale) ──
let current: string | undefined
let isWin = false
let configDir = ''
let transcript = ''
let sessionId = ''
let title: string | undefined
let titleAt = 0
let effort: string | undefined
let modelId = ''
let cacheRead = 0
let cacheCreate = 0
let lastStepAt: number | undefined
let stat: Data['stat']
let statAt = 0
let timerOn = false

// Path MSYS (/e/...) → path Windows (E:/...) per $.fs, che è nativo.
const native = (p: string) => {
  const s = p.replace(/\\/g, '/')
  return isWin ? s.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, d: string) => `${d.toUpperCase()}:`) : s
}

const readOr = async ($: EngineInterface, path: string) => {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

// Branch da .git/HEAD senza processo git; risale le directory come lo script.
// Nei worktree .git è un file "gitdir: <path>".
export const branchOf = async ($: EngineInterface, cwd: string) => {
  let d = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  while (d) {
    let head = await readOr($, `${d}/.git/HEAD`)
    if (head === undefined) {
      const gitdir = (await readOr($, `${d}/.git`))?.match(/^gitdir: (.+)$/m)?.[1]?.trim()
      if (gitdir) head = await readOr($, `${/^(\/|[A-Za-z]:)/.test(gitdir) ? native(gitdir) : `${d}/${gitdir}`}/HEAD`)
    }
    if (head !== undefined) return head.match(/^ref: refs\/heads\/(\S+)/)?.[1] ?? 'HEAD'
    const up = d.replace(/\/[^/]*$/, '')
    if (up === d) break
    d = up
  }
  return undefined
}

// Ultimo customTitle del transcript (/rename o titolo automatico). grep perché
// il transcript supera spesso i 4 MiB che $.fs.read accetta.
const titleOf = async ($: EngineInterface, path: string) => {
  const r = await $.process.run(['grep', '-oE', '"customTitle":"([^"\\\\]|\\\\.)*"', path.replace(/\\/g, '/')])
  const last = r.stdout.trim().split('\n').pop()
  if (!last) return undefined
  return (JSON.parse(last.slice('"customTitle":'.length)) as string).replace(/ \(Branch\)$/, '')
}

// Timer, prompt e turn.step si sovrappongono: un refresh alla volta, e quello
// arrivato nel mezzo riparte appena il corrente finisce.
let running: Promise<void> | undefined
let again = false
const refresh = ($: EngineInterface): Promise<void> => {
  if (running) {
    again = true
    return running
  }
  running = draw($).finally(() => {
    running = undefined
    if (again) {
      again = false
      void refresh($)
    }
  })
  return running
}

const draw = async ($: EngineInterface) => {
  try {
    const now = await $.clock.now()
    const [cwd, model, usage, settings, flag] = await Promise.all([
      $.session.cwd(),
      $.session.model(),
      $.session.usage(),
      $.settings.read(),
      readOr($, `${configDir}/.ponytail-active`),
    ])
    const branch = await branchOf($, cwd)
    if (branch && now - statAt >= GIT_STAT_MS) {
      statAt = now
      const s = (await $.process.run(['git', '-C', cwd, 'diff', '--shortstat']).catch(() => undefined))?.stdout ?? ''
      const add = Number(s.match(/(\d+) insertion/)?.[1] ?? 0)
      const del = Number(s.match(/(\d+) deletion/)?.[1] ?? 0)
      stat = add + del > 0 ? { add, del } : undefined
    }
    if (transcript && now - titleAt >= TITLE_MS) {
      titleAt = now
      title = (await titleOf($, transcript).catch(() => undefined)) ?? title
    }
    const s = settings as { fastMode?: boolean; effortLevel?: string }
    current = line(
        {
          ponytail: flag?.trim(),
          model: prettyModel(model),
          modelId: modelId || model,
          effort: effort ?? s.effortLevel,
          fast: s.fastMode === true,
          cwd,
          branch,
          stat: branch ? stat : undefined,
          title: title ?? (sessionId ? sessionId.slice(0, 8) : undefined),
          tokens: usage.context.tokens ?? 0,
          window: usage.context.window,
          cacheRead,
          cacheCreate,
          lastStepAt,
          rateLimits: usage.rateLimits,
        },
        now,
      )
    const jev = (await $.state.get({ plugin: 'jev-skill-suggestion', key: 'status' }).catch(() => undefined))?.value
    // La statusline nativa (settings.json) stampa questa variabile: niente script né jq a ogni refresh.
    // Una mod non può disegnare nella riga della statusline nativa, tra il prompt e -- INSERT --.
    await $.env.set('CLAUDE_STATUSLINE', jev ? current + SEP + paint(C.dim, jev.replace(/^jev · /, 'jev: ')) : current)
  } catch {
    // Un refresh fallito lascia la riga precedente: la statusline non deve mai rompere la sessione.
  }
}

export const register: Register = on => {
  on('classic.SessionStart', async ($, e, next) => {
    transcript = e.transcript_path
    sessionId = e.session_id
    title = e.session_title
    titleAt = 0
    cacheRead = cacheCreate = 0
    lastStepAt = undefined
    // Un errore qui non deve bloccare l'avvio della sessione.
    try {
      const home = (await $.env.get('HOME'))?.replace(/\\/g, '/') ?? ''
      isWin = /^[A-Za-z]:/.test(home)
      configDir = native((await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`)
      if (!timerOn) {
        $.clock.every(REFRESH_MS, () => void refresh($))
        timerOn = true
      }
    } catch {}
    void refresh($)
    return next(e)
  })

  // Il badge ponytail cambia al prompt: ridisegna subito.
  on('classic.UserPromptSubmit', ($, e, next) => {
    void refresh($)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (!e.agentId) {
      if (typeof e.effort === 'string') effort = e.effort
      modelId = r.usage?.model ?? e.model
      if (r.usage) {
        cacheRead = r.usage.cache_read_input_tokens
        cacheCreate = r.usage.cache_creation_input_tokens
        lastStepAt = await $.clock.now()
      }
      void refresh($)
    }
    return r
  })
}
