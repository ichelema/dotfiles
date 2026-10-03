---
description: Work assigned Linear issues — fetch, mark in-progress, implement, mark done, comment. Routes through the installed linear skill.
argument-hint: "[optional — issue ID(s), comma-separated, e.g. ICH-23 or ICH-23, ICH-26. Empty = work all assigned in priority order.]"
---

# /linear

Work Linear issues end-to-end. All Linear operations go through the installed
**`linear` skill** at `~/.pi/agent/skills/linear/SKILL.md` — never via the
deprecated Linear MCP server, which has been removed.

## Identity

The agent operates under whichever auth the loaded skill provides:

- **`linear` with OAuth `client_credentials`** (recommended for autonomous use): the OAuth app's bot user — e.g. `ClaudeBot` / `claudebot1`. Comments, issue updates, and audit-log entries attribute to the bot. See `references/auth.md`.
- **`linear` with a personal API key**: your user identity. It supports reads
  and writes, including admin operations permitted to that account. Prefer the
  OAuth bot for autonomous work when bot attribution is desired.

For reads, filter assigned work with `assignee: { isMe: { eq: true } }`; Linear
will use the currently authenticated user or bot identity. For assignment
mutations, resolve the target user and consume its ID in-process.

## Usage

```
/linear                        # Work highest-priority assigned issue → lowest
/linear ICH-23                 # Work the named issue
/linear ICH-23, ICH-26         # Work the listed issues in order
```

## Execution logic

**If `$ARGUMENTS` contains issue IDs:**
1. Parse the comma-separated list.
2. For each ID, fetch the issue (title, description, state, project, labels, parent) via the `linear` skill. Work them in the order given.

**If `$ARGUMENTS` is empty:**
1. List issues where `assignee: { isMe: { eq: true } }` and `state: { type: { nin: ["completed", "canceled"] } }`.
2. Use the authenticated identity directly; no viewer-ID lookup or cache is needed.
3. Order by `priority` ascending (1 = Urgent → 4 = Low), then by `updatedAt` descending.
4. Work the highest-priority issue first.

## Standard task workflow (per issue)

1. **Fetch.** Read the issue's full detail via `scripts/linear.py query` using the `Get one issue, with relations` snippet from `references/common-queries.md`.
2. **Started.** Move the issue to a state whose `type` is `started` via `issueUpdate(id, input: { stateId: ... })`. Resolve the team's matching workflow states and consume the selected ID programmatically in the same shell/script as the mutation. If more than one state has that type, ask the user which one to use.

   **Cascade up to the parent epic.** Right after the child transition, check `parent.state.type`. If it's `triage`, `backlog`, or `unstarted` (i.e. the epic hasn't been started yet), transition the parent to its team's selected `started` state too. **Idempotent** — skip if the parent is already in any `started` state (another story has already moved it). **One level only** — don't recurse to grandparents.

   Compact form, both transitions in one batched mutation:

   ```graphql
   mutation Start($childId: String!, $parentId: String!, $startedStateId: String!) {
     child:  issueUpdate(id: $childId,  input: { stateId: $startedStateId }) { success issue { state { name } } }
     parent: issueUpdate(id: $parentId, input: { stateId: $startedStateId }) { success issue { state { name } } }
   }
   ```

   Skip the `parent:` clause if there's no parent or the parent is already started.
3. **Implement.** Do the work. Before changing code, read and follow the current project's `AGENTS.md`, `CLAUDE.md`, or other loaded repository instructions. Use only available skills whose triggers match the task.
4. **Completed.** Once the work is complete and tests pass, resolve a state whose `type` is `completed` and move the issue to it. If more than one state has that type, ask the user which one to use. After completing a child, re-read its parent and siblings. If every child is completed but the parent is not, report it; do not transition the parent automatically unless the user or issue explicitly requests it.
5. **Comment.** Post a short summary comment on the issue — what was done, the commit hash(es), the branch, anything the next reader needs to know. The comment is authored by the bot identity loaded above.

## Issue creation conventions

When **creating** Linear issues (whether one-offs or as part of distilling a plan), follow this hierarchy convention. The title prefix gives at-a-glance visibility; the label gives filterability.

### Epics

- **Title prefix**: `Epic — <subject>` (e.g. `Epic — Phase 4 polish`).
- **Label**: apply the **`Epic`** label (orange — `#F2994A`).
- **Parent**: none. Epics are top-level containers.
- **Body**: outline the goal, the stories that hang off it, and the success criteria.

### Stories

- **Title**: no prefix.
- **Label**: apply the **`Story`** label (green — `#27AE60`).
- **Parent**: set `parentId` to the Epic's UUID. Stories are *always* children of an Epic.
- **Body**: user-story-sized scope — small enough to ship in one go.

### Resolving label IDs at use time

Labels are referenced by **UUID** in `IssueCreateInput.labelIds`, but workspace-portability means the agent should resolve them by **name** at use time rather than hardcoding:

```graphql
query LabelIds {
  issueLabels(filter: {
    name: { in: ["Epic", "Story"] }
  }) {
    nodes { id name }
  }
}
```

Require one exact match for each label and consume the IDs programmatically in
the same shell/script as the issue creation mutation.

### Setup for a new workspace

If you've cloned this repo into a workspace that doesn't yet have the labels, run this once via the `linear` skill:

```graphql
mutation Setup {
  epic: issueLabelCreate(input: {
    name: "Epic", color: "#F2994A",
    description: "Top-level container for a body of work containing 1+ stories. Title prefix 'Epic — '."
  }) { success issueLabel { id name } }
  story: issueLabelCreate(input: {
    name: "Story", color: "#27AE60",
    description: "User-story-sized unit of work; child of an Epic-labelled issue."
  }) { success issueLabel { id name } }
}
```

Workspace-scoped (no `teamId`) so the labels apply across all teams.

### Corpo di una issue standard

Quando crei una issue usa questo template. `Problem` e `Acceptance criteria`
sono obbligatori; le altre sezioni solo se hanno contenuto utile.

    ## Problem

    <what is broken or missing, with enough context that the reader
    understands the why without asking>

    ## Acceptance criteria

    - [ ] <testable condition>

    ## Technical constraints

    <architectural limitations, system dependencies, compatibility requirements>

    ## Required tests

    - [ ] <specific test to write or verify>

Il titolo descrive l'azione da compiere, non il sintomo
(es. "Fix redirect after magic link login", non "Login bug").

Prima di creare mostra il corpo completo in inglese e chiedi conferma.

## Hard rules

- Never call `mcp__linear-server__*` tools or `mcp__claude_ai_Linear__*` tools. Both are gone — calls will fail.
- Use `isMe` for assigned-work queries. For assignment mutations, resolve the
  target user and consume its ID in-process.
- Resolve IDs from keys, names, or identifiers and consume them
  programmatically in the same shell/script as the mutation. Never copy an ID
  rendered in the conversation into a later request, and require one exact
  match before mutating.
- Never modify identity fields (`title`, `parent`, `labels`, `project`) the issue body doesn't ask you to change. Identity stays as filed unless the user explicitly authorises a change.
- Each issue must move through lifecycle states in order. Never move one issue
  directly from `triage`, `backlog`, or `unstarted` to `completed`. The child
  and its parent may enter `started` together in the documented cascade
  mutation.
- If a workflow needs an operation outside `references/common-queries.md`, run `scripts/linear.py introspect <Type>` to compose the right mutation rather than guessing.
- When creating an Epic, the `Epic` label **and** the `Epic — ` title prefix both apply — neither alone. Same for Stories: the label and the parent link both apply, never one without the other.
- **Cascade-on-start, not on close.** When moving a child to a `started` state, also move its parent if the parent's `state.type` is `triage`, `backlog`, or `unstarted`. After completing a child, report a still-open parent whose children are all completed; don't transition it automatically without explicit authorization.

