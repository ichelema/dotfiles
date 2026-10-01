/**
 * Integration smoke test: index.ts wiring against a mock ExtensionContext.
 * Git behavior runs against a REAL temporary repository.
 *
 * NOTE: bun's node:child_process is broken on Windows, so the integration
 * harness implements PI's exec contract with Bun.spawn.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";

type PiExec = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;

const runCommand: PiExec = async (command, args, options) => {
  const proc = Bun.spawn([command, ...args], {
    cwd: options?.cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: options?.signal,
  });
  const timer = options?.timeout ? setTimeout(() => proc.kill(), options.timeout) : undefined;
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (timer) clearTimeout(timer);
  return { stdout, stderr, code: exitCode, killed: proc.killed };
};

const { default: extension } = await import("../index.ts");

const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "nord-footer-test-"));
  tempDirs.push(dir);
  const git = (args: string) => execSync(`git ${args}`, { cwd: dir, stdio: "pipe" });
  git("init -q -b main");
  writeFileSync(join(dir, "a.txt"), "hello\n");
  git("-c user.email=t@example.com -c user.name=t add a.txt");
  git("-c user.email=t@example.com -c user.name=t commit -qm init");
  writeFileSync(join(dir, "a.txt"), "hello\nworld\n"); // unstaged: +1 -0
  return dir;
}

function makeTempNonRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "nord-footer-test-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

interface CtxState {
  model: { provider: string; id: string } | undefined;
  thinkingLevel: string | undefined;
  cwd: string;
  entries: unknown[];
  leafId: string | null;
}

function makeCtx(initial?: Partial<CtxState>) {
  const state: CtxState = {
    model: { provider: "openai-codex", id: "gpt-5.6-sol" },
    thinkingLevel: "medium",
    cwd: makeTempRepo(),
    entries: [],
    leafId: null,
    ...initial,
  };

  let footerFactory:
    | ((tui: unknown, theme: unknown, footerData: unknown) => {
        invalidate(): void;
        render(width: number): string[];
        dispose(): void;
      })
    | undefined;
  let restored = false;
  const extensionStatuses = new Map<string, string>();

  const ctx = {
    mode: "tui",
    cwd: state.cwd,
    model: state.model,
    thinkingLevel: state.thinkingLevel,
    sessionManager: {
      getEntries: () => state.entries,
      getLeafId: () => state.leafId,
    },
    getContextUsage: () => ({ tokens: 35000, contextWindow: 1_000_000, percent: 3 }),
    modelRegistry: {
      // No auth resolved -> the quota bootstrap is skipped without any fetch.
      getProviderAuth: async () => undefined,
    },
    ui: {
      setFooter: (factory: unknown) => {
        if (factory === undefined) restored = true;
        footerFactory = factory as typeof footerFactory;
      },
    },
  };

  return {
    state,
    ctx,
    getFooterFactory: () => footerFactory,
    isRestored: () => restored,
    // Build the footer component the way interactive-mode does.
    instantiateFooter: (fg: (color: string, text: string) => string = (_color, text) => text) => {
      if (!footerFactory) throw new Error("setFooter was never called");
      const tui = { requestRender: () => {} };
      const theme = { name: "nord", fg };
      let branch: string | null = "main";
      const listeners: (() => void)[] = [];
      const footerData = {
        getGitBranch: () => branch,
        getExtensionStatuses: () => extensionStatuses,
        onBranchChange: (cb: () => void) => {
          listeners.push(cb);
          return () => {
            const i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
          };
        },
      };
      const component = footerFactory(tui, theme, footerData);
      return {
        component,
        setBranch: (b: string | null) => {
          branch = b;
          listeners.forEach((cb) => cb());
        },
        setExtensionStatus: (key: string, value: string) => {
          extensionStatuses.set(key, value);
        },
      };
    },
  };
}

async function flush(times = 2): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Poll until the footer line satisfies the predicate (real git is slow). */
async function waitFor(
  render: () => string,
  predicate: (line: string) => boolean,
  timeoutMs = 8000,
): Promise<string> {
  const start = Date.now();
  for (;;) {
    const line = render();
    if (predicate(line)) return line;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for footer condition; last line: ${line}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function loadExtension(exec: PiExec = runCommand): Map<string, (event: unknown, ctx: unknown) => unknown> {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
  const pi = {
    on: (event: string, handler: (e: unknown, c: unknown) => unknown) => handlers.set(event, handler),
    exec,
  };
  extension(pi as never);
  return handlers;
}

const repoName = (dir: string) => dir.split(/[\\/]/).pop();

describe("nord-footer integration", () => {
  test("Git commands run through PI's exec API", async () => {
    let calls = 0;
    const handlers = loadExtension(async () => {
      calls++;
      return {
        stdout: "",
        stderr: "fatal: not a git repository (or any of the parent directories): .git",
        code: 128,
        killed: false,
      };
    });
    const mock = makeCtx({ cwd: makeTempNonRepo() });
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();
    footer.component.render(160);
    await flush();
    expect(calls).toBe(1);
  });

  test("session_start installs the footer; git diff vs HEAD appears", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);

    const footer = mock.instantiateFooter();
    footer.component.render(160);

    const line = await waitFor(
      () => footer.component.render(160)[0],
      (l) => l.includes(`${repoName(mock.state.cwd)}@main (+1 -0)`),
    );
    expect(line).toContain("35k/1m (3%)");
    expect(line).toContain("7d —"); // quota unavailable (no auth)
    expect(visibleWidth(line)).toBeLessThanOrEqual(160);
  });

  test("extension statuses update and disappear when off", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    mkdirSync(join(mock.state.cwd, ".pi"));
    writeFileSync(
      join(mock.state.cwd, ".pi", "modes.json"),
      JSON.stringify({ modes: { advisor: { provider: "deepseek", modelId: "deepseek-v4-flash" } } }),
    );
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter((color, text) =>
      color === "muted" ? `\x1b[90m${text}\x1b[39m` : text,
    );

    footer.setExtensionStatus("ponytail", "○ 🐴 ponytail: ⚡ FULL");
    footer.setExtensionStatus("q-advisor", "│ Advisor: $0.00");
    expect(footer.component.render(80)[0]).toContain("🐴 ponytail: ⚡ FULL");
    expect(footer.component.render(80)[0]).toContain(
      "Advisor:\x1b[90m deepseek/deepseek-v4-flash $0.00\x1b[39m",
    );

    footer.setExtensionStatus("ponytail", "○ 🐴 ponytail: 🔥 ULTRA");
    expect(footer.component.render(80)[0]).toContain("🐴 ponytail: 🔥 ULTRA");

    footer.setExtensionStatus("ponytail", "");
    expect(footer.component.render(80)[0]).not.toContain("🐴 ponytail:");
    expect(footer.component.render(80)[0]).toContain(
      "Advisor:\x1b[90m deepseek/deepseek-v4-flash $0.00\x1b[39m",
    );

    footer.setExtensionStatus("q-advisor", "");
    expect(footer.component.render(80)[0]).not.toContain("Advisor:");
    expect(visibleWidth(footer.component.render(10)[0])).toBeLessThanOrEqual(10);
  });

  test("staged + unstaged tracked files are counted against HEAD", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();
    footer.component.render(160);

    const line = await waitFor(() => footer.component.render(160)[0], (l) => l.includes("(+1 -0)"));
    expect(line).toContain("(+1 -0)");
  });

  test("non-repository cwd omits the git segment", async () => {
    const handlers = loadExtension();
    const mock = makeCtx({ cwd: makeTempNonRepo() });
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();
    footer.component.render(160);

    const line = await waitFor(() => footer.component.render(160)[0], (l) => l.includes("gpt-5.6-sol"));
    // After the not-a-repo resolution the git segment stays hidden.
    expect(line).not.toContain("@");
  });

  test("branch change updates the footer reactively", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();
    footer.component.render(160);
    await waitFor(() => footer.component.render(160)[0], (l) => l.includes("@main"));

    footer.setBranch("feature/x");
    footer.component.render(160);
    const line = await waitFor(() => footer.component.render(160)[0], (l) => l.includes("@feature/x"));
    expect(line).toContain("@feature/x");
  });

  test("model_select to a non-codex provider renders session cost", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();

    await handlers.get("model_select")!(
      { model: { provider: "deepseek", id: "deepseek-v4" }, previousModel: { provider: "openai-codex", id: "gpt-5.6-sol" } },
      mock.ctx as never,
    );
    const line = footer.component.render(160)[0];
    expect(line).toContain("deepseek-v4");
    expect(line).toContain("cost $0.000");
    expect(line).not.toContain("7d ");
  });

  test("turn_end includes the assistant usage persisted by PI", async () => {
    const handlers = loadExtension();
    const mock = makeCtx({ model: { provider: "deepseek", id: "deepseek-v4" } });
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();

    mock.state.entries.push({
      type: "message",
      id: "assistant-1",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      message: {
        role: "assistant",
        content: [],
        usage: {
          input: 1000,
          output: 100,
          cacheRead: 2000,
          cacheWrite: 0,
          totalTokens: 3100,
          cost: { total: 0.25 },
        },
      },
    });
    mock.state.leafId = "assistant-1";

    expect(handlers.has("turn_end")).toBe(true);
    await handlers.get("turn_end")!({ turnIndex: 0 }, mock.ctx as never);
    const line = footer.component.render(160)[0];
    expect(line).toContain("cost $0.250");
    expect(line).toContain("cache 2k↓/0↑ (67%)");
  });

  test("after_provider_response headers update the quota", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();

    await handlers.get("after_provider_response")!(
      {
        status: 200,
        headers: {
          "x-codex-primary-used-percent": "1",
          "x-codex-primary-window-minutes": "10080",
          "x-codex-primary-reset-at": `${new Date(2026, 8, 4, 12).getTime() / 1000}`,
        },
      },
      mock.ctx as never,
    );
    const line = footer.component.render(160)[0];
    expect(line).toContain("7d 1% @set 4");
  });

  test("session_shutdown restores the default footer", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();

    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    mock.instantiateFooter();
    expect(mock.isRestored()).toBe(false);

    await handlers.get("session_shutdown")!({ reason: "quit" }, mock.ctx as never);
    expect(mock.isRestored()).toBe(true);
  });

  test("tool_execution_end on write/edit/bash marks git stale (refetch within TTL)", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    const footer = mock.instantiateFooter();
    footer.component.render(160);
    await flush();

    // Simulate a file change, then a write tool completing.
    writeFileSync(join(mock.state.cwd, "a.txt"), "hello\nworld\nmore\n");
    await handlers.get("tool_execution_end")!({ toolName: "write", toolCallId: "2" }, mock.ctx as never);
    footer.component.render(160);

    const line = await waitFor(() => footer.component.render(160)[0], (l) => l.includes("(+2 -0)"));
    expect(line).toContain("(+2 -0)");
  });

  test("non-TUI mode never installs the footer", async () => {
    const handlers = loadExtension();
    const mock = makeCtx();
    (mock.ctx as { mode: string }).mode = "rpc";
    await handlers.get("session_start")!({ reason: "startup" }, mock.ctx as never);
    expect(mock.getFooterFactory()).toBeUndefined();
  });
});
