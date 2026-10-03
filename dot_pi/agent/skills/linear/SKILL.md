---
name: linear
description: >-
  Talk to Linear's GraphQL API directly via a thin Python CLI, with
  progressive-discovery references for issues, projects, comments, webhooks,
  cycles, workflow states, and admin. Use for any Linear read or write; the
  Linear MCP is unavailable.
---

# linear

You are talking to **Linear** (linear.app — the issue tracker). This skill is
the alternative to the Linear MCP: instead of pre-loaded tool definitions, you
compose GraphQL operations and run them through `scripts/linear.py`. You only
learn the bits of Linear you need for the task in front of you.

## When to use

Use this skill when the user asks to:

- read or change Linear data (issues, projects, comments, documents, cycles, etc.)
- set up or manage **webhooks**
- manage **cycles** or **workflow states** as writes
- create / update **issue relations**, reactions, notification subscriptions,
  templates, custom views, favorites
- query the **audit log** or call admin mutations (user roles, org invites)

All Linear operations use this skill and `scripts/linear.py`; the Linear MCP is
unavailable.

## First-run checklist

1. Run commands from the skill directory so `python-dotenv` can load `.env`.
   When the current working directory is another project, do not invoke
   `python scripts/linear.py` relatively: use the absolute skill path (or
   `cd` into the skill directory first):

   ```bash
   LINEAR_SKILL_DIR="/home/ichelema/.pi/agent/skills/linear"
   python "$LINEAR_SKILL_DIR/scripts/linear.py" query \
     'query { viewer { id name email } }'
   ```

   This avoids `python: can't open file .../scripts/linear.py` errors caused by
   resolving the relative path from the project directory.
2. Le dipendenze runtime (`httpx` + `python-dotenv`) sono già installate nel
   Python mise 3.13 del plugin.
3. Smoke check:

   ```bash
   python "$HOME"/.pi/agent/skills/linear/scripts/linear.py query \
     'query { viewer { id name email } }'
   ```

4. If authentication fails, follow `references/auth.md`; otherwise pick the
   reference file matching the task and load only that one.

## Default team

If the user does not name a team, default to **Ichelema** (key `ICH`):

```graphql
query { teams(filter: { key: { eq: "ICH" } }) { nodes { id key name } } }
```

Resolve exactly one team and consume its `id` programmatically in the same
shell/script as the mutation. Only override the default when the user
explicitly names a different team.

## Reference file index — load only what you need

- `references/auth.md`: getting a key, switching to OAuth, token revocation,
  and scopes.
- `references/schema-summary.md`: entity model, identifiers, pagination,
  filtering, and save/delete semantics.
- `references/rate-limits.md`: 429s, complexity errors, retry strategy, and
  observed limits.
- `references/common-queries.md`: day-to-day reads and writes for issues,
  projects, comments, and docs (the Phase 1 MCP-parity surface).
- `references/webhooks.md`: subscribing to issue, comment, project, and cycle
  events.
- `references/mutations-cheatsheet.md`: the "gap five" — cycles, workflow
  states, relations, templates, and admin.
- `references/cycles-daily-automation.md`: daily cycles, rollover, and the
  14-day rolling roadmap (uses `scripts/cycles_maintain.py`).
- `references/prune-archive.md`: querying the local sqlite archive of pruned
  issues (used by `/linear-prune` and `scripts/linear_prune.py`).
- `references/git-pr-workflow.md`: branch/PR/merge workflow, magic words,
  niente auto-merge, and cleanup.

Don't load every file. Load `schema-summary.md` for orientation and one
task-specific file. If you're stuck on an unknown type, run
`scripts/linear.py introspect <TypeName>` rather than loading more references.

## CLI

```bash
python scripts/linear.py query     <doc-or-file> [--variables JSON|@file.json]
python scripts/linear.py mutation  <doc-or-file> [--variables JSON|@file.json]
python scripts/linear.py introspect <TypeName>

# Idempotent daily-cycle roadmap maintainer.
# Run once a day past AWST midnight.
python scripts/cycles_maintain.py --team ICH [--days-ahead N] \
  [--auto-assign] [--dry-run]
```

### CLI output shape — already unwrapped

**Important:** `linear.py query` and `linear.py mutation` print the contents of
the GraphQL `data` field directly:

```python
json.dump(body.get("data", body), ...)
```

Therefore, parsed stdout has **no top-level `data` key**.

```ruby
result = JSON.parse(stdout)

# Correct
issue = result.fetch("issue")
updates = result.values

# Wrong — raises KeyError
data = result.fetch("data")
```

Rate-limit information is written to stderr and is not part of the JSON output.
Always check the process exit status before parsing stdout.

- `<doc-or-file>` is either an inline GraphQL string or a path to a `.graphql`
  file.
- Rate-limit headers (`x-ratelimit-*`) and `x-complexity` are logged to
  **stderr** after every call.
- 429 raises and exits non-zero with `retry-after` in the message. The CLI does
  not auto-retry.
- Personal keys (`lin_api_…`) go in `Authorization` raw. OAuth tokens
  (`lin_oauth_…`) get `Bearer` and a trailing space prepended automatically.

Supported authentication methods are personal API keys, OAuth
`client_credentials`, and OAuth `authorization_code`; setup and lifecycle
details live in `references/auth.md`.

## One worked example end-to-end

Task: "Create a P1 bug in the ICH team titled `auth: 401 on token refresh`,
then list its assignee and state."

```bash
python scripts/examples/create_issue.py \
  --team-key ICH \
  --title "auth: 401 on token refresh" \
  --priority 1
```

The helper resolves the team key, requires exactly one match, passes the UUID
directly to the mutation, checks `success`, and reports the resulting assignee
and state.

## Patterns to follow

- **Always select `success` on mutations.** Linear can return `success: false`
  with no error array. Check it.
- **Pass IDs as variables, not string interpolation.** GraphQL variables are
  typed and avoid injection.
- **Resolve opaque IDs in-process.** When a mutation needs an ID discovered by
  key, name, or identifier, chain the lookup and mutation in the same
  shell/script and pass the returned ID programmatically. IDs rendered in the
  conversation may be transformed and are unsafe to copy into a later request.
  Require one exact match before mutating.
- **Page with `nodes` + `pageInfo.endCursor`.** Don't fetch `first: 250` if you
  only need 10.
- **For unknown types, introspect one type at a time.** `__schema` will trip the
  complexity cap.
- **Soft vs hard delete is a real distinction.** `issueDelete(id)` trashes; add
  `permanentlyDelete: true` to purge.

## Lingua

Il contenuto che finisce **dentro** Linear va sempre scritto in inglese, anche
quando l'utente scrive in italiano: le issue sono lette da altri e restano nel
tempo, quindi la lingua del workspace prevale su quella della conversazione.

Ci finiscono i campi `description`, i commenti e anche **titolo e descrizione
delle Pull Request**: Linear aggancia la PR alla issue come attachment e ne usa
il titolo, che diventa così testo del workspace a tutti gli effetti.

Vale lo stesso per i **messaggi di commit**: la history la leggono `git blame`,
le release notes e chi arriva dopo, e sopravvive alla sessione che l'ha prodotta.

La conversazione con l'utente resta in italiano: riepiloghi, domande e output a
schermo non seguono questa regola.

## Regole di sicurezza

- **Non modificare Linear quando l'utente chiede solo di consultare**, elencare
  o riepilogare. Una lettura che scrive è un effetto collaterale che l'utente
  non ha chiesto e non si aspetta di dover controllare.
- **Non inventare mai ID** (issue, progetto, stato, label, priorità, relazione).
  Un ID inventato non fallisce in modo rumoroso: crea silenziosamente un
  collegamento sbagliato o nessun collegamento. Recupera sempre i valori
  correnti via GraphQL prima di agire.

## What this skill does NOT do (yet)

- Auto-retry on 429 / complexity errors. Caller decides.
- Bulk operations beyond what GraphQL exposes natively (`issueBatchCreate` is
  reachable; client doesn't add a multi-call wrapper).
- Webhook receiver scaffolding. The skill manages webhook *subscriptions*; you
  bring your own HTTP endpoint.

## Where to look first when something breaks

- `error: LINEAR_API_KEY not set`: see `references/auth.md`.
- `HTTP 429` or `rate limited`: see `references/rate-limits.md`.
- `field "x" not allowed on type "Y"`: run `linear.py introspect Y` and check
  `references/schema-summary.md`.
- `Entity not found` after a delete: deletion is soft by default; see the
  soft-vs-hard section of `references/schema-summary.md`.
- Mutation returns `success: false` with an empty error array: the operation
  was rejected silently; introspect the input type for missing required fields.
