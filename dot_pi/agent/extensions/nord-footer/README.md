# nord-footer — footer Nord per PI

Estensione globale per **PI 0.84.4** che sostituisce completamente il footer predefinito in modalità TUI con una singola riga reattiva:

```
gpt-5.6-sol | medium | Trinity@main (+12 -3) | 35k/1m (3%) | cache 35k↓/0↑ (100%) | 7d 1% @set 4
```

Per provider non associati alla sottoscrizione OpenAI Codex, l'ultimo segmento mostra il costo cumulativo della sessione:

```
deepseek-v4 | high | Trinity@main (+12 -3) | 35k/1m (3%) | cache 35k↓/0↑ (100%) | cost $0.123
```

## Segmenti

| Segmento | Formato | Fonte |
|---|---|---|
| Modello | `ctx.model.id` (fallback `no-model`) | `ctx.model` |
| Effort | `off / minimal / low / medium / high / xhigh / max` | `ctx.thinkingLevel` |
| Repository | `root@branch (+A -D)` — `+/-` = diff working tree vs `HEAD` (staged + unstaged tracked) | `git rev-parse --show-toplevel`, `git diff --numstat HEAD --`, `footerData.getGitBranch()` |
| Context | `35k/1m (3%)` — `?/1m (?)` dopo compaction | `ctx.getContextUsage()` |
| Cache | `cache R↓/W↑ (hit%)` — totali sessione, hit rate aggregato | `ctx.sessionManager.getEntries()` |
| Quota (solo `openai-codex`) | `7d N% @mese giorno` — header `x-codex-{primary,secondary}-*`; bootstrap best-effort su `/wham/usage` o `/api/codex/usage` | header risposta + endpoint usage |
| Costo (altri provider) | `cost $0.123` — totale sessione (`usage.cost.total`), tre decimali fino a $9.999 | `ctx.sessionManager.getEntries()` |

## Comportamento

- **Stale-while-revalidate**: `render()` è sincrona e usa sempre l'ultimo dato valido; i refresh Git/quota partono in background senza bloccare il rendering.
- **TTL**: diff 1.5 s, errore Git 5 s, quota 60 s, errore quota 30 s, timeout Git/quota 3 s. Nessun polling fisso.
- **Single-flight**: una sola Promise per refresh Git e una per la quota; i trigger concorrenti non duplicano lavoro.
- **Cache usage**: chiave `<numero-entry>:<leaf-id>`; nuove entry e navigazione dell'albero invalidano i totali dopo la persistenza (`turn_end`, `session_compact`, `session_tree`).
- **Responsive**: 9 livelli di degradazione (nascondi cache → semplifica Git → nascondi Git → compatta quota → nascondi effort → nascondi quota/costo → nascondi context → tronca modello). Mai wrap, mai overflow: fit e troncamento con `visibleWidth()`/`truncateToWidth()` ANSI-safe.
- **Colori**: esclusivamente tramite il `theme` passato da `setFooter()` (tema Nord attivo); nessun RGB hard-coded. `invalidate()` ricostruisce le stringhe colorate al cambio tema.
- **Lifecycle**: footer installato in `session_start` (solo `ctx.mode === "tui"`), rimosso e risorse liberate in `session_shutdown`/`dispose` (AbortController, unsubscribe branch, callback redraw invalidata, flag `disposed`).

## Struttura

```
~/.pi/agent/extensions/nord-footer/
├── index.ts           — factory estensione, eventi, lifecycle
├── footer-state.ts    — stato runtime, snapshot, cache TTL, single-flight, aggregazione usage
├── footer-format.ts   — formattazione pura, segmenti, layout responsive, styling
├── openai-quota.ts    — parsing header/payload quota, JWT, fetch bootstrap best-effort
├── git-stats.ts       — rev-parse/diff tramite pi.exec, parsing numstat
└── tests/             — unit + integration (bun test)
```

## Test

```bash
cd ~/.pi/agent/extensions/nord-footer
bun test            # 123 test: formatter, stato, quota, git, integration
npx tsc -p tsconfig.typecheck.json --noEmit   # typecheck con i tipi reali di PI
```

I test di integration usano un repository Git temporaneo reale e implementano il contratto `pi.exec` con `Bun.spawn`.

## Note di sicurezza

- Nessuna credenziale viene loggata o persistita; token e account id viaggiano solo negli header della richiesta bootstrap.
- La fetch quota è best-effort: 401/403/404/429, timeout e JSON invalido vengono scartati silenziosamente; i redirect non vengono seguiti.
- Errore Git/quota degrada il dato mostrato (ultimo valore valido o `—`), mai PI.
