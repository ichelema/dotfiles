// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Blast Radius: queues a risky Bash command and shows what it would change.
//
// tool.call (Bash): if the command is risky, work out its blast radius, refuse
// the call at once and add the command to a queue. The agent goes on working.
// ui.render (Pane): draws the queue, one Yes/No pair per command. Yes runs the
// command in bash from the mod itself, No drops it; either way the row leaves.
// If the surface won't place the pane (a narrow terminal), the same queue is
// drawn in the AbovePrompt band instead.
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are
// spelled literally, and helpers that take `$` are top-level functions.

const PANE_ID = "blast-radius";
const LIST_MAX = 10;
const RUN_LIMIT_MS = 10 * 60 * 1000; // ceiling of $.process.run

// Commands waiting for Yes/No, oldest first. The agent is never held: a risky
// call is refused at once and lands here. Yes runs it in bash, No drops it.
const queue = [];
let nextId = 1;
let where = "pane"; // "band" when the terminal is too narrow for the pane
// False in a `claude -p` run or under the SDK: nobody can press Yes, so a
// risky command is refused with no queue.
let isInteractive = true;
// rm under ~/.claude/tmp (the agent's scratch folder) runs without a hold.
// session.start adds HOME's absolute forms (E:/… and /e/… on MSYS2).
const tmpPrefixes = ["~/.claude/tmp/", "$HOME/.claude/tmp/", "${HOME}/.claude/tmp/"];
let isCaseless = false; // Windows paths: HOME may come lowercased (e:\msys64\home\sphynx)

export function register(on) {
  on("session.start", async ($, e, next) => {
    isInteractive = e.isInteractive;
    try {
      const home = (await $.env.get("HOME"))?.replace(/\\/g, "/");
      if (home) {
        isCaseless = /^[A-Za-z]:/.test(home);
        tmpPrefixes.push(`${home}/.claude/tmp/`, `${home.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)}/.claude/tmp/`);
      }
    } catch {
      // only the ~ and $HOME forms are exempt
    }
    return next(e);
  });

  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const command = String(e.command ?? "");
    const risk = classify(command);
    if (risk === null) {
      return next(e);
    }
    if (!isInteractive) {
      return { deny: `Blast Radius: ${risk.label} needs a person to confirm, and this session has none (claude -p / SDK). Do not retry it.` };
    }
    // Measure where the command will run: the session folder, moved by any
    // `cd dir &&` or `git -C dir` earlier in the same command line.
    const sessionCwd = await $.session.cwd();
    const cwd = risk.dir ? await resolveDir($, sessionCwd, risk.dir) : sessionCwd;
    const report = cwd === null
      ? { summary: `${risk.label} in ${risk.dir}`, lines: [], note: `Couldn't find the folder ${risk.dir}, so I couldn't measure what this would change.` }
      : await measure($, risk, cwd);
    const item = { id: nextId++, command, cwd: sessionCwd, risk, report, running: false };
    queue.push(item);
    await showQueue($, queue.length === 1);
    return {
      deny: `Blast Radius queued this command as #${item.id}: the user runs it by hand (Yes) or drops it (No). It would: ${report.summary}. Do not retry it and do not assume it ran; go on with the rest of the task.`,
    };
  });

  on("ui.render", { component: "Pane" }, ($, e, next) => {
    if (e.requestId !== PANE_ID || queue.length === 0) {
      return next(e);
    }
    return draw($, $.ui.resolve(e));
  });

  on("ui.render", { component: "AbovePrompt" }, ($, e, next) => {
    if (queue.length === 0 || where !== "band") {
      return next(e);
    }
    return draw($, $.ui.resolve(e));
  });
}

// Opens, retitles or closes the pane to match the queue. Focus only on the
// first command, so later ones don't steal the keyboard while the user types.
async function showQueue($, focus) {
  if (queue.length === 0) {
    try {
      await $.ui.close({ id: PANE_ID });
    } catch {
      // already gone
    }
    where = "pane";
  } else {
    const opened = await $.ui.open({ id: PANE_ID, title: `Blast Radius (${queue.length})`, ...(focus ? { focus: true } : {}), rows: paneRows() });
    where = opened.isPlaced ? "pane" : "band";
  }
  $.ui.invalidate("ui.render");
}

// ---- What counts as risky -------------------------------------------------

// sudo options that take a value, so the value isn't read as the command.
const SUDO_VALUE_OPTIONS = new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-T", "-U"]);
// Commands that only read, so a bare word "migrate" in them isn't a migration.
const READ_ONLY = new Set(["ls", "cat", "echo", "printf", "grep", "rg", "find", "less", "head", "tail", "cd", "git"]);

/** A folder a later `cd arg` moves to, given the folder so far (null = the session folder). */
function joinDir(dir, arg) {
  if (arg === undefined || arg === "~" || arg.startsWith("/") || arg.startsWith("~/")) {
    return arg ?? "~";
  }
  return dir ? `${dir}/${arg}` : arg;
}

/** The first risky segment of a shell command, or null. */
function classify(command) {
  let dir = null; // where a `cd` earlier on the line moved to; null means the session folder
  const scopes = []; // dir to restore when a ( subshell ) closes
  const pushed = []; // pushd stack, for popd
  for (const raw of command.split(/&&|\|\||;|\||\n/)) {
    const opens = (raw.match(/^\s*\(+/)?.[0].trim().length) ?? 0;
    // Trailing redirects and & don't hide a closing ) : `(cd sub && make) > log`.
    const tail = raw.replace(/(?:\s*(?:\d*>>?|&>>?|<)\s*\S+|\s*&)+\s*$/, "");
    const closes = (tail.match(/\)+\s*$/)?.[0].trim().length) ?? 0;
    for (let k = 0; k < opens; k += 1) {
      scopes.push(dir);
    }
    const risk = classifySegment(raw, dir, pushed);
    if (risk !== null && risk.cd === undefined) {
      return risk;
    }
    if (risk !== null) {
      dir = risk.cd; // a cd, pushd or popd moved the folder
    }
    for (let k = 0; k < closes && scopes.length > 0; k += 1) {
      dir = scopes.pop(); // a cd inside ( ... ) doesn't outlive it
    }
  }
  return null;
}

// Words that can come before the real command without changing what it does.
const PREFIXES = new Set(["command", "exec", "env", "nohup", "time", "then", "do", "else", "!"]);

// ponytail: textual check; a symlink inside tmp followed by `rm -r link/` reaches outside it
function isScratch(target, dir) {
  // No \ → / here: unquoted, bash eats the backslashes, so such a path is held.
  const fold = (s) => (isCaseless ? s.toLowerCase() : s);
  const path = fold(/^(\/|~\/|\$|[A-Za-z]:)/.test(target) ? target : joinDir(dir, target));
  return tmpPrefixes.map(fold).some((p) => path.startsWith(p) && path.length > p.length && !/\.\.|\$|`/.test(path.slice(p.length)));
}

/** One segment: a risk, { cd } for a folder change, or null. */
function classifySegment(segment, dir, pushed) {
  {
    const words = tokenize(segment.trim().replace(/^[({]+\s*/, "").replace(/\s*[)}]+$/, ""));
    while (words.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
      words.shift(); // leading VAR=value
    }
    if (words[0] === "sudo") {
      words.shift();
      while (words.length > 0 && words[0].startsWith("-")) {
        const option = words.shift();
        if (SUDO_VALUE_OPTIONS.has(option)) {
          words.shift();
        }
      }
    }
    while (words.length > 0 && (PREFIXES.has(words[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))) {
      words.shift();
    }
    if (words[0] === "nice") {
      words.shift();
      if (words[0] === "-n") {
        words.splice(0, 2);
      } else if (/^-\d+$/.test(words[0] ?? "")) {
        words.shift();
      }
    }
    const [first, ...args] = words;
    if (first === undefined) {
      return null;
    }
    const cmd = first.replace(/^\\/, ""); // \rm skips aliases; it's still rm
    if (cmd === "cd") {
      return { cd: args[0] === "-" ? "-" : joinDir(dir, args[0]) };
    }
    if (cmd === "pushd") {
      pushed.push(dir);
      return { cd: joinDir(dir, args[0]) };
    }
    if (cmd === "popd") {
      return { cd: pushed.length > 0 ? pushed.pop() : "-" };
    }
    if (cmd === "rm" || cmd.endsWith("/rm")) {
      const flags = args.filter((a) => a.startsWith("-"));
      const recursive = flags.some((f) => f === "--recursive" || (/^-[^-]/.test(f) && /[rR]/.test(f)));
      const force = flags.some((f) => f === "--force" || (/^-[^-]/.test(f) && f.includes("f")));
      if (recursive || force) {
        const targets = args.filter((a) => !a.startsWith("-") || a === "-");
        if (targets.length > 0 && targets.every((t) => isScratch(t, dir))) {
          return null;
        }
        return { kind: "rm", label: `rm ${flags.join(" ")}`.trim(), targets, dir };
      }
    }
    if (cmd === "git") {
      // Git's own options come before the subcommand; -C moves where it runs.
      let gitDir = dir;
      let i = 0;
      while (i < args.length && args[i].startsWith("-")) {
        if (args[i] === "-C" && i + 1 < args.length) {
          gitDir = joinDir(gitDir, args[i + 1]);
          i += 2;
        } else if (args[i] === "-c" && i + 1 < args.length) {
          i += 2;
        } else {
          i += 1;
        }
      }
      const sub = args[i];
      const rest = args.slice(i + 1);
      if (sub === "reset" && rest.includes("--hard")) {
        return { kind: "git-reset", label: "git reset --hard", args: rest, dir: gitDir };
      }
      if (sub === "clean") {
        return { kind: "git-clean", label: "git clean", args: rest, dir: gitDir };
      }
      if (sub === "push" && rest.some((a) => a === "--force" || a === "-f" || a.startsWith("--force-with-lease") || /^\+/.test(a))) {
        return { kind: "git-push-force", label: "git push --force", args: rest, dir: gitDir };
      }
      const stagedOnly = sub === "restore" && rest.includes("--staged") && !rest.includes("--worktree") && !rest.includes("-W");
      if ((sub === "checkout" || sub === "restore") && rest.includes(".") && !stagedOnly) {
        return { kind: "git-checkout", label: `git ${sub} -- .`, args: rest, dir: gitDir };
      }
    }
    const joined = words.join(" ");
    if (/\balembic\s+upgrade\b/.test(joined)) {
      return { kind: "migrate", tool: "alembic", label: "alembic upgrade", dir };
    }
    if (/\bdb:migrate(?!:status\b)/.test(joined)) {
      return { kind: "migrate", tool: "rails", label: "db:migrate", dir };
    }
    if (/\bprisma\s+migrate\b/.test(joined)) {
      return { kind: "migrate", tool: "prisma", label: "prisma migrate", dir };
    }
    if (/\bmanage\.py\s+migrate\b/.test(joined)) {
      return { kind: "migrate", tool: "django", label: "manage.py migrate", dir };
    }
    if (!READ_ONLY.has(cmd) && args.includes("migrate")) {
      return { kind: "migrate", tool: "unknown", label: "migrate", dir };
    }
  }
  return null;
}

// Resolves a `cd` target to an absolute folder, or null if it doesn't exist.
// The target is passed as an argument, never as source.
const CD_SCRIPT = `unset CDPATH; d="$1"; case "$d" in "~") d="$HOME";; "~/"*) d="$HOME/\${d#\\~/}";; esac; cd -- "$d" 2>/dev/null && pwd -P`;

async function resolveDir($, sessionCwd, dir) {
  if (dir === "-") {
    return null; // `cd -` depends on the shell's history
  }
  const run = await $.process.run(["bash", "-c", CD_SCRIPT, "blast-radius", dir], { cwd: sessionCwd, timeoutMs: 5000 });
  const out = run.stdout.trim();
  return run.exitCode === 0 && out !== "" ? out : null;
}

/** Splits one segment into words, honouring quotes. Good enough to read flags and paths. */
function tokenize(text) {
  const words = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    words.push(m[1] ?? m[2] ?? m[3]);
  }
  return words;
}

// ---- Measuring the blast radius -------------------------------------------

/** { summary, lines, note } for the pane. Never throws: a failed read is said, not hidden. */
async function measure($, risk, cwd) {
  try {
    if (risk.kind === "rm") {
      return await measureRm($, risk, cwd);
    }
    if (risk.kind === "migrate") {
      return await measureMigrations($, risk, cwd);
    }
    return await measureGit($, risk, cwd);
  } catch (error) {
    return { summary: `${risk.label} (could not measure it)`, lines: [], note: `Could not measure: ${String(error?.message ?? error).slice(0, 200)}` };
  }
}

// The paths are passed to bash as arguments, never as source, so nothing in
// them runs. compgen -G expands a glob without command substitution.
const RM_SCRIPT = `
shopt -s nullglob dotglob
paths=()
for p in "$@"; do
  case "$p" in "~"|"~/"*) p="$HOME\${p#\\~}";; esac
  if [[ "$p" == *[*?[]* ]]; then
    while IFS= read -r m; do paths+=("$m"); done < <(compgen -G "$p")
  elif [[ -e "$p" || -L "$p" ]]; then
    paths+=("$p")
  fi
done
if (( \${#paths[@]} == 0 )); then echo "0 0 0"; exit 0; fi
# A relative path gets ./ in front, so find never reads a name like -delete as an action.
for i in "\${!paths[@]}"; do case "\${paths[$i]}" in /*) ;; *) paths[$i]="./\${paths[$i]}";; esac; done
files=$(find "\${paths[@]}" \\( -type f -o -type l \\) 2>/dev/null | wc -l | tr -d ' ')
kb=$(du -skc "\${paths[@]}" 2>/dev/null | tail -n1 | cut -f1)
echo "$files $(( \${kb:-0} * 1024 )) \${#paths[@]}"
find "\${paths[@]}" \\( -type f -o -type l \\) 2>/dev/null | head -n ${LIST_MAX}
`;

async function measureRm($, risk, cwd) {
  if (risk.targets.length === 0) {
    return { summary: "rm with no paths", lines: [], note: "No paths to expand." };
  }
  const run = await $.process.run(["bash", "-c", RM_SCRIPT, "blast-radius", ...risk.targets], { cwd, timeoutMs: 15000 });
  const [head, ...rest] = run.stdout.split("\n").filter((l) => l !== "");
  const [files, bytes, found] = (head ?? "0 0 0").split(" ").map(Number);
  if (!found) {
    return { summary: `delete nothing: no file matches ${risk.targets.join(" ")}`, lines: [], note: "The paths don't exist, so rm has nothing to remove." };
  }
  if (!files) {
    return { summary: `delete ${found} ${found === 1 ? "path" : "paths"} with no files in ${found === 1 ? "it" : "them"}`, lines: [], note: `Paths: ${risk.targets.join(" ")}` };
  }
  return {
    summary: `delete ${files} ${files === 1 ? "file" : "files"} (about ${size(bytes)})`,
    lines: rest.map((l) => l.replace(/^\.\//, "")),
    more: Math.max(0, files - rest.length),
    note: `Paths: ${risk.targets.join(" ")}`,
  };
}

async function measureGit($, risk, cwd) {
  if (risk.kind === "git-push-force") {
    return await measurePush($, risk, cwd);
  }
  if (risk.kind === "git-clean") {
    const flags = [];
    const paths = [];
    for (let i = 0; i < risk.args.length; i += 1) {
      const a = risk.args[i];
      if (a === "--") {
        paths.push(...risk.args.slice(i + 1));
        break;
      }
      if (a === "-e" || a === "--exclude") {
        flags.push(a, risk.args[i + 1] ?? "");
        i += 1;
      } else if (a.startsWith("--exclude=") || /^-e./.test(a)) {
        flags.push(a);
      } else if (/^-[a-zA-Z]+$/.test(a)) {
        const kept = a.replace(/[finq]/g, ""); // -n is added below; -f, -i and -q would change the dry run
        if (kept !== "-") {
          flags.push(kept);
        }
      } else if (!a.startsWith("-")) {
        paths.push(a);
      }
    }
    const run = await $.process.run(["git", "clean", "-n", ...flags, "--", ...paths], { cwd, timeoutMs: 15000 });
    if (run.exitCode !== 0) {
      return { summary: "git clean (could not dry-run it)", lines: [], note: run.stderr.trim().slice(0, 200) };
    }
    const gone = run.stdout.split("\n").filter((l) => l.startsWith("Would remove ")).map((l) => l.slice(13));
    return {
      summary: gone.length === 0 ? "remove nothing: no untracked files match" : `remove ${gone.length} untracked ${gone.length === 1 ? "path" : "paths"}`,
      lines: gone.slice(0, LIST_MAX),
      more: Math.max(0, gone.length - LIST_MAX),
      note: "From git clean -n. Untracked files are not in git, so they can't be recovered.",
    };
  }
  const status = await $.process.run(["git", "status", "--porcelain"], { cwd, timeoutMs: 15000 });
  if (status.exitCode !== 0) {
    return { summary: `${risk.label} (not a git repo here?)`, lines: [], note: status.stderr.trim().slice(0, 200) };
  }
  const rows = status.stdout.split("\n").filter((l) => l.length > 3 && !l.startsWith("??"));
  // reset --hard drops staged and unstaged changes; checkout -- . drops unstaged ones.
  const lost = risk.kind === "git-reset" ? rows : rows.filter((l) => l[1] !== " ");
  const stat = await $.process.run(["git", "diff", "--shortstat", risk.kind === "git-reset" ? "HEAD" : "--"], { cwd, timeoutMs: 15000 });
  return {
    summary: lost.length === 0 ? "discard nothing: no uncommitted changes" : `discard uncommitted changes in ${lost.length} ${lost.length === 1 ? "file" : "files"}`,
    lines: lost.slice(0, LIST_MAX).map((l) => `${l.slice(0, 2)} ${l.slice(3)}`),
    more: Math.max(0, lost.length - LIST_MAX),
    note: stat.stdout.trim() !== "" ? `${stat.stdout.trim()}. Uncommitted changes can't be recovered.` : "From git status --porcelain.",
  };
}

async function measurePush($, risk, cwd) {
  const positional = risk.args.filter((a) => !a.startsWith("-"));
  const remote = positional[0] ?? "origin";
  // A refspec is src:dst. With no colon, the local branch of the same name is pushed.
  const spec = (positional[1] ?? "").replace(/^\+/, "");
  let [source, branch] = spec.includes(":") ? spec.split(":") : [spec, spec];
  branch = (branch ?? "").replace(/^refs\/heads\//, "");
  if (!branch) {
    const head = await $.process.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeoutMs: 10000 });
    branch = head.stdout.trim();
    source = "HEAD";
  } else if (branch === "HEAD") {
    // `git push origin HEAD` pushes the current branch to its namesake.
    const head = await $.process.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeoutMs: 10000 });
    branch = head.stdout.trim();
    source = "HEAD";
  }
  source = source || "HEAD";
  const ref = `${remote}/${branch}`;
  const known = await $.process.run(["git", "rev-parse", "--verify", "--quiet", ref], { cwd, timeoutMs: 10000 });
  if (known.exitCode !== 0) {
    return { summary: `force-push to ${ref}`, lines: [], note: `No local copy of ${ref}, so I can't tell which commits the push would drop. Run git fetch first.` };
  }
  const log = await $.process.run(["git", "log", "--oneline", "--no-decorate", `${source}..${ref}`], { cwd, timeoutMs: 15000 });
  const dropped = log.stdout.split("\n").filter((l) => l !== "");
  return {
    summary: dropped.length === 0 ? `force-push to ${ref}: drops no commits` : `force-push to ${ref}: drops ${dropped.length} ${dropped.length === 1 ? "commit" : "commits"}`,
    lines: dropped.slice(0, LIST_MAX),
    more: Math.max(0, dropped.length - LIST_MAX),
    note: `Commits on ${ref} that ${source} doesn't have, as of the last fetch.`,
  };
}

const MIGRATION_LISTERS = {
  django: { argv: ["python3", "manage.py", "showmigrations", "--plan"], pending: (l) => l.startsWith("[ ]"), strip: (l) => l.slice(4) },
  alembic: { argv: ["alembic", "history", "-r", "current:head"], pending: (l) => l.includes("->"), strip: (l) => l },
  rails: { argv: ["bin/rails", "db:migrate:status"], pending: (l) => /^\s*down\b/.test(l), strip: (l) => l.trim() },
  prisma: { argv: ["npx", "--no-install", "prisma", "migrate", "status"], pending: (l) => /^\s{2}\S/.test(l), strip: (l) => l.trim() },
};

async function measureMigrations($, risk, cwd) {
  const lister = MIGRATION_LISTERS[risk.tool];
  if (lister === undefined) {
    return { summary: "run migrations", lines: [], note: "I can't list the pending migrations for this tool, so the list is not shown." };
  }
  let run;
  try {
    run = await $.process.run(lister.argv, { cwd, timeoutMs: 20000 });
  } catch (error) {
    run = { exitCode: -1, stdout: "", stderr: String(error?.message ?? error) };
  }
  if (run.exitCode !== 0) {
    return { summary: `run ${risk.label}`, lines: [], note: `Couldn't list pending migrations (${lister.argv.join(" ")} failed).` };
  }
  const pending = run.stdout.split("\n").filter(lister.pending).map(lister.strip);
  return {
    summary: pending.length === 0 ? `run ${risk.label}: nothing pending` : `apply ${pending.length} pending ${pending.length === 1 ? "migration" : "migrations"}`,
    lines: pending.slice(0, LIST_MAX),
    more: Math.max(0, pending.length - LIST_MAX),
    note: `From ${lister.argv.join(" ")}.`,
  };
}

function size(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes || 0} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = -1;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

// ---- Drawing --------------------------------------------------------------

function paneRows() {
  const first = queue[0].report;
  const failed = queue.reduce((n, it) => n + (it.failed ? 1 + it.failed.lines.length : 0), 0);
  return Math.min(24, 3 + 4 * queue.length + failed + first.lines.length + (first.more ? 1 : 0) + (first.note ? 1 : 0));
}

// Yes runs the command in bash from the folder the agent was in, No drops it
// (Dismiss on a failed row is a No); a decided row leaves the list unless it
// failed. A running row answers no second press.
function decide($, item, choice) {
  return async () => {
    if (item.running) {
      return;
    }
    if (choice === "yes") {
      item.running = true;
      $.ui.invalidate("ui.render");
      let outcome;
      let stderr = "";
      try {
        const run = await $.process.run(["bash", "-c", item.command], { cwd: item.cwd, timeoutMs: RUN_LIMIT_MS });
        outcome = run.exitCode === 0 ? "done" : `exit ${run.exitCode}`;
        stderr = run.stderr.trim();
        if (stderr !== "") {
          $.ui.log(`#${item.id} stderr: ${stderr.slice(0, 500)}`);
        }
      } catch (error) {
        outcome = `failed: ${String(error?.message ?? error).slice(0, 100)}`;
      }
      // Success leaves the list with a toast; a failure stays on the pane, in red,
      // with the tail of stderr and a Dismiss button, so nothing is missed.
      if (outcome === "done") {
        $.ui.toast(`Blast Radius #${item.id} done: ${item.command}`);
      } else {
        item.running = false;
        item.failed = { outcome, lines: stderr.split("\n").filter((l) => l !== "").slice(-5) };
        $.ui.invalidate("ui.render");
        return;
      }
    }
    const i = queue.indexOf(item);
    if (i >= 0) {
      queue.splice(i, 1);
    }
    await showQueue($, false);
  };
}

function draw($, t) {
  const { Box, Text } = t;
  return Box({
    flexDirection: "column",
    borderStyle: "round",
    borderColor: "yellow",
    paddingX: 1,
    children: [
      Text({ key: "title", bold: true, color: "yellow", children: `⚠ Blast Radius · ${queue.length} waiting` }),
      ...queue.map((item, i) => drawItem($, t, item, i === 0)),
    ],
  });
}

// The file list and the hotkeys go to the oldest command only, to keep the pane short.
function drawItem($, { Box, Text, Button }, item, first) {
  const { id, report } = item;
  const list = first ? report.lines.map((line, i) => Text({ key: `l${id}:${i}`, children: `  ${line}`, wrap: "truncate-end" })) : [];
  if (first && report.more) {
    list.push(Text({ key: `more${id}`, dimColor: true, children: `  + ${report.more} more` }));
  }
  return Box({
    key: `item${id}`,
    flexDirection: "column",
    marginTop: 1,
    children: [
      Text({ key: `cmd${id}`, children: [Text({ dimColor: true, children: `#${id}  ` }), Text({ bold: true, children: item.command })], wrap: "truncate-end" }),
      Text({ key: `sum${id}`, children: [Text({ dimColor: true, children: "Would  " }), Text({ color: "red", bold: true, children: report.summary })] }),
      ...list,
      first && report.note ? Text({ key: `note${id}`, dimColor: true, italic: true, children: report.note, wrap: "wrap" }) : null,
      item.failed ? Text({ key: `err${id}`, color: "red", bold: true, children: `✖ ${item.failed.outcome}` }) : null,
      ...(item.failed ? item.failed.lines.map((line, i) => Text({ key: `e${id}:${i}`, color: "red", children: `  ${line}`, wrap: "wrap" })) : []),
      item.running
        ? Text({ key: `run${id}`, color: "yellow", children: "running in bash…" })
        : item.failed
          ? Button({ key: `dismiss${id}`, label: "Dismiss", plain: true, ...(first ? { hotkey: "1", autoFocus: true } : {}), onPress: decide($, item, "no") })
          : Box({
              key: `btn${id}`,
              gap: 2,
              children: [
                Button({ key: `yes${id}`, label: "Yes", plain: true, ...(first ? { hotkey: "1" } : {}), onPress: decide($, item, "yes") }),
                Button({ key: `no${id}`, label: "No", plain: true, ...(first ? { hotkey: "2", autoFocus: true } : {}), onPress: decide($, item, "no") }),
              ],
            }),
    ],
  });
}
