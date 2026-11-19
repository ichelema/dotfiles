import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// Replica il comportamento di Claude Code: un `cd` nel tool bash resta valido per i comandi
// successivi e read/edit/write/grep/find/ls risolvono i percorsi relativi sulla cartella attiva.
// Fuori dalla cartella della sessione e dai worktree del suo repo la cartella torna a quella
// iniziale. enter_worktree/exit_worktree replicano EnterWorktree/ExitWorktree.

const ENTRY = "session-cwd";

type Worktree = {
	path: string;
	branch?: string;
	baseSha?: string;
	created: boolean;
	returnTo: string;
};
type State = { cwd: string; worktree?: Worktree };

function real(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function within(child: string, parent: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function git(cwd: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function worktreePaths(cwd: string): string[] {
	try {
		return git(cwd, ["worktree", "list", "--porcelain"])
			.split("\n")
			.filter((line) => line.startsWith("worktree "))
			.map((line) => real(line.slice("worktree ".length)));
	} catch {
		return [];
	}
}

export default function (pi: ExtensionAPI) {
	let base = real(process.cwd());
	let state: State = { cwd: base };

	// getSettings() non è disponibile durante il caricamento: si legge a ogni esecuzione.
	const settings = () =>
		pi.getSettings() as {
			shellCommandPrefix?: string;
			shellPath?: string;
			images?: { autoResize?: boolean };
		};
	const bashOptions = () => ({
		commandPrefix: settings().shellCommandPrefix,
		shellPath: settings().shellPath,
	});
	const readOptions = () => ({
		autoResizeImages: settings().images?.autoResize ?? true,
	});
	const noOptions = () => undefined;

	const allowed = (dir: string) =>
		existsSync(dir) &&
		(within(dir, base) || worktreePaths(base).some((wt) => within(dir, wt)));

	const showStatus = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(
			ENTRY,
			state.cwd === base
				? undefined
				: `cwd: ${relative(dirname(base), state.cwd)}`,
		);
	};

	const setState = (next: State, ctx: ExtensionContext) => {
		if (next.cwd === state.cwd && next.worktree === state.worktree) return;
		state = next;
		pi.appendEntry<State>(ENTRY, state);
		showStatus(ctx);
	};

	// I tool built-in risolvono i percorsi su `ctx.cwd`, che prevale sul cwd della factory:
	// il contesto passato al tool riporta la cartella attiva.
	const withCwd = <T extends object>(ctx: T, cwd: string): T =>
		new Proxy(ctx, {
			get: (target, key) =>
				key === "cwd" ? cwd : Reflect.get(target, key, target),
		});

	// La cartella attiva, riportata a quella iniziale se non esiste più o è fuori dai limiti.
	const activeCwd = (
		ctx: ExtensionContext,
	): { cwd: string; reset: boolean } => {
		if (state.cwd === base || allowed(state.cwd))
			return { cwd: state.cwd, reset: false };
		setState({ cwd: base }, ctx);
		return { cwd: base, reset: true };
	};

	const restore = (ctx: ExtensionContext) => {
		base = real(ctx.cwd);
		state = { cwd: base };
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === ENTRY && entry.data)
				state = entry.data as State;
		}
		if (!allowed(state.cwd)) state = { cwd: base };
		showStatus(ctx);
	};
	pi.on("session_start", async (_event, ctx) => restore(ctx));
	pi.on("session_tree", async (_event, ctx) => restore(ctx));

	pi.on("before_agent_start", async (event) => {
		event.systemPromptOptions.cwd = state.cwd;
	});

	// --- bash: esegue nella cartella attiva e registra quella in cui il comando termina ---
	const bashTemplate = createBashToolDefinition(base);
	pi.registerTool({
		...bashTemplate,
		async execute(id, params, signal, onUpdate, ctx) {
			const { cwd, reset } = activeCwd(ctx);
			const marker = join(
				tmpdir(),
				`pi-cwd-${process.pid}-${id.replace(/[^\w-]/g, "_")}`,
			);
			const tool = createBashToolDefinition(cwd, {
				...bashOptions(),
				spawnHook: (spawn) => ({
					...spawn,
					command: `trap 'pwd -P >| '"'"'${marker}'"'"' 2>/dev/null' EXIT\n${spawn.command}`,
				}),
			});
			const notes: string[] = reset ? [`Shell cwd was reset to ${base}`] : [];
			const track = () => {
				let next: string;
				try {
					next = readFileSync(marker, "utf8").trim();
					rmSync(marker, { force: true });
				} catch {
					return;
				}
				if (!next || next === state.cwd) return;
				if (allowed(next)) {
					setState({ ...state, cwd: next }, ctx);
				} else {
					setState({ ...state, cwd: base }, ctx);
					notes.push(`Shell cwd was reset to ${base}`);
				}
			};
			try {
				const result = await tool.execute(
					id,
					params,
					signal,
					onUpdate,
					withCwd(ctx, cwd),
				);
				track();
				if (notes.length)
					result.content = [
						...result.content,
						{ type: "text", text: notes.join("\n") },
					];
				return result;
			} catch (error) {
				track();
				if (!notes.length) throw error;
				throw new Error(
					`${error instanceof Error ? error.message : String(error)}\n${notes.join("\n")}`,
				);
			}
		},
	});

	// --- strumenti sui file: percorsi relativi risolti sulla cartella attiva ---
	const fileTools = [
		{
			create: createReadToolDefinition,
			options: readOptions,
			defaultActive: true,
		},
		{
			create: createEditToolDefinition,
			options: noOptions,
			defaultActive: true,
		},
		{
			create: createWriteToolDefinition,
			options: noOptions,
			defaultActive: true,
		},
		{
			create: createGrepToolDefinition,
			options: noOptions,
			defaultActive: false,
		},
		{
			create: createFindToolDefinition,
			options: noOptions,
			defaultActive: false,
		},
		{
			create: createLsToolDefinition,
			options: noOptions,
			defaultActive: false,
		},
	] as const;
	for (const { create, options, defaultActive } of fileTools) {
		// biome-ignore lint/suspicious/noExplicitAny: le factory hanno firme diverse ma compatibili
		const factory = create as (cwd: string, options?: any) => any;
		pi.registerTool({
			...factory(base),
			defaultActive,
			execute: (id, params, signal, onUpdate, ctx) => {
				const { cwd } = activeCwd(ctx);
				return factory(cwd, options()).execute(
					id,
					params,
					signal,
					onUpdate,
					withCwd(ctx, cwd),
				);
			},
		});
	}

	// --- worktree ---
	const text = (value: string) => ({
		content: [{ type: "text" as const, text: value }],
		details: undefined,
	});

	pi.registerTool({
		name: "enter_worktree",
		label: "Enter Worktree",
		description:
			"Create an isolated git worktree (new branch from HEAD under <repo>/.pi/worktrees/<name>) and switch the session's working directory into it. With `path`, enter an existing worktree of this repository instead. Bash, read, edit, write, grep, find and ls then work relative to the worktree until exit_worktree.",
		promptSnippet:
			"Create or enter a git worktree and make it the session working directory",
		promptGuidelines: [
			"Use enter_worktree only when the user asks to work in a worktree; then use relative paths and plain commands without `cd` into the worktree.",
			"Use exit_worktree when the worktree work is finished; use action 'remove' only if the user wants the worktree deleted.",
		],
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({
					description:
						"Worktree name (letters, digits, . _ -). Default: generated",
				}),
			),
			path: Type.Optional(
				Type.String({
					description: "Existing worktree to enter instead of creating one",
				}),
			),
		}),
		executionMode: "sequential",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (state.worktree)
				throw new Error(
					`Already in worktree ${state.worktree.path}; call exit_worktree first`,
				);
			const returnTo = activeCwd(ctx).cwd;
			if (params.path) {
				const path = real(resolve(returnTo, params.path));
				if (!worktreePaths(base).includes(path))
					throw new Error(`${path} is not a worktree of this repository`);
				setState(
					{ cwd: path, worktree: { path, created: false, returnTo } },
					ctx,
				);
				return text(
					`Entered existing worktree ${path}. Working directory: ${path}`,
				);
			}
			const name = params.name ?? `wt-${Date.now().toString(36)}`;
			if (!/^[\w.-]+$/.test(name) || name.startsWith("."))
				throw new Error(`Invalid worktree name: ${name}`);
			const root = git(base, ["rev-parse", "--show-toplevel"]);
			const path = join(root, ".pi", "worktrees", name);
			const branch = `worktree-${name}`;
			const baseSha = git(root, ["rev-parse", "HEAD"]);
			mkdirSync(dirname(path), { recursive: true });
			git(root, ["worktree", "add", "-b", branch, path, "HEAD"]);
			const exclude = git(root, [
				"rev-parse",
				"--path-format=absolute",
				"--git-common-dir",
			]);
			const excludeFile = join(exclude, "info", "exclude");
			const excluded = existsSync(excludeFile)
				? readFileSync(excludeFile, "utf8")
				: "";
			if (!excluded.split("\n").includes("/.pi/worktrees/")) {
				mkdirSync(dirname(excludeFile), { recursive: true });
				appendFileSync(
					excludeFile,
					`${excluded && !excluded.endsWith("\n") ? "\n" : ""}/.pi/worktrees/\n`,
				);
			}
			const realPath = real(path);
			setState(
				{
					cwd: realPath,
					worktree: {
						path: realPath,
						branch,
						baseSha,
						created: true,
						returnTo,
					},
				},
				ctx,
			);
			return text(
				`Created worktree ${realPath} on branch ${branch} (from ${baseSha.slice(0, 8)}). Working directory: ${realPath}`,
			);
		},
	});

	pi.registerTool({
		name: "exit_worktree",
		label: "Exit Worktree",
		description:
			"Leave the worktree entered with enter_worktree and return to the previous working directory. action 'keep' leaves worktree and branch on disk; 'remove' deletes a worktree created by enter_worktree and its branch, refusing if it has uncommitted changes or new commits unless discard_changes is true.",
		parameters: Type.Object({
			action: StringEnum(["keep", "remove"] as const),
			discard_changes: Type.Optional(
				Type.Boolean({
					description:
						"Required to remove a worktree with uncommitted changes or new commits",
				}),
			),
		}),
		executionMode: "sequential",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const wt = state.worktree;
			if (!wt) throw new Error("Not in a worktree entered with enter_worktree");
			const returnTo = existsSync(wt.returnTo) ? wt.returnTo : base;
			if (params.action === "keep") {
				setState({ cwd: returnTo }, ctx);
				return text(
					`Left worktree ${wt.path} (kept${wt.branch ? `, branch ${wt.branch}` : ""}). Working directory: ${returnTo}`,
				);
			}
			if (!wt.created || !wt.branch || !wt.baseSha) {
				throw new Error(
					"Only worktrees created by enter_worktree in this session can be removed; use action 'keep'",
				);
			}
			if (existsSync(wt.path)) {
				const dirty = git(wt.path, ["status", "--porcelain"]);
				const commits = git(wt.path, [
					"rev-list",
					"--count",
					`${wt.baseSha}..HEAD`,
				]);
				if ((dirty || commits !== "0") && !params.discard_changes) {
					throw new Error(
						`Worktree has ${dirty ? "uncommitted changes" : ""}${dirty && commits !== "0" ? " and " : ""}${commits !== "0" ? `${commits} new commit(s)` : ""}. Ask the user, then retry with discard_changes: true or use action 'keep'.`,
					);
				}
				git(base, [
					"worktree",
					"remove",
					...(params.discard_changes ? ["--force"] : []),
					wt.path,
				]);
			} else {
				git(base, ["worktree", "prune"]);
			}
			git(base, ["branch", "-D", wt.branch]);
			setState({ cwd: returnTo }, ctx);
			return text(
				`Removed worktree ${wt.path} and branch ${wt.branch}. Working directory: ${returnTo}`,
			);
		},
	});
}
