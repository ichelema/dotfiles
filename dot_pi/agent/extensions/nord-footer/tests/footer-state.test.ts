/**
 * Tests for footer-state.ts — usage aggregation, caches, single-flight.
 * Run with: bun test
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import {
  aggregateUsage,
  FooterState,
  GIT_DIFF_TTL_MS,
  GIT_ERROR_TTL_MS,
  type FooterServices,
  type UsageEntryLike,
} from "../footer-state.ts";

const plainTheme = { name: "plain", fg: (_color: string, text: string) => text };

/** Let all pending microtasks (async Git chains) drain. */
async function flush(times = 2): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Usage fixtures (section 14.2)
// ---------------------------------------------------------------------------

function entry(type: string, extra: Record<string, unknown> = {}): UsageEntryLike {
  return { type, id: "x", parentId: null, timestamp: "t", ...extra } as unknown as UsageEntryLike;
}

const assistant = (usage: unknown) =>
  entry("message", { message: { role: "assistant", content: [], usage } });
const toolResult = (usage: unknown) =>
  entry("message", { message: { role: "toolResult", toolCallId: "c", toolName: "bash", content: [], isError: false, usage } });
const compaction = (usage?: unknown) => entry("compaction", usage ? { usage } : {});
const branchSummary = (usage?: unknown) => entry("branch_summary", usage ? { usage } : {});

const USAGE = (over: Partial<{ input: number; cacheRead: number; cacheWrite: number; cost: number }>) => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { total: 0 },
  ...over,
});

describe("aggregateUsage", () => {
  test("sums assistant usage", () => {
    const totals = aggregateUsage([
      assistant(USAGE({ input: 1000, cacheRead: 200, cacheWrite: 100, cost: 0.05 })),
      assistant(USAGE({ input: 500, cacheRead: 0, cacheWrite: 0, cost: 0.02 })),
    ]);
    expect(totals).toEqual({ input: 1500, cacheRead: 200, cacheWrite: 100, cost: 0.07 });
  });

  test("counts nested tool usage, compaction and branch summaries", () => {
    const totals = aggregateUsage([
      assistant(USAGE({ input: 1000, cost: 0.05 })),
      toolResult(USAGE({ input: 400, cost: 0.01 })),
      compaction(USAGE({ input: 300, cost: 0.005 })),
      branchSummary(USAGE({ input: 200, cost: 0.002 })),
    ]);
    expect(totals.input).toBe(1900);
    expect(totals.cost).toBeCloseTo(0.067, 5);
  });

  test("ignores entries without usage (legacy, user, custom)", () => {
    const totals = aggregateUsage([
      entry("message", { message: { role: "user", content: "hi" } }),
      assistant(undefined as unknown as never),
      entry("custom", {}),
      entry("label", {}),
    ]);
    expect(totals).toEqual({ input: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
  });

  test("supports legacy numeric cost", () => {
    const totals = aggregateUsage([assistant(USAGE({ cost: 0.01 }))]);
    expect(totals.cost).toBe(0.01);
  });

  test("multiple models in one session accumulate", () => {
    const totals = aggregateUsage([
      assistant(USAGE({ input: 100, cost: 0.001 })),
      assistant(USAGE({ input: 100, cost: 0.002 })),
    ]);
    expect(totals.input).toBe(200);
    expect(totals.cost).toBe(0.003);
  });

  test("empty session", () => {
    expect(aggregateUsage([])).toEqual({ input: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
  });
});

// ---------------------------------------------------------------------------
// FooterState harness
// ---------------------------------------------------------------------------

interface Harness {
  state: FooterState;
  execCalls: string[][];
  signals: (AbortSignal | undefined)[];
  renders: number;
  entries: UsageEntryLike[];
  leafId: string;
  context: ContextUsage;
  clock: number;
}

function makeHarness(overrides?: Partial<FooterServices>): Harness {
  const execCalls: string[][] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const harness: Harness = {
    state: null as unknown as FooterState,
    execCalls,
    signals,
    renders: 0,
    entries: [],
    leafId: "leaf-1",
    context: { tokens: 35000, contextWindow: 1_000_000, percent: 3 },
    clock: 1_000_000,
  };

  const services: FooterServices = {
    cwd: "C:/work/Trinity",
    exec: async (command, args, options) => {
      execCalls.push([command, ...args]);
      signals.push(options?.signal);
      const [first] = args;
      if (command === "git" && first === "rev-parse") {
        return { stdout: "C:/work/Trinity\n", stderr: "", code: 0 };
      }
      if (command === "git" && first === "diff") {
        return { stdout: "5\t2\tsrc/a.ts\n3\t1\tsrc/b.ts\n", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    },
    modelProvider: () => "openai-codex",
    modelId: () => "gpt-5.6-sol",
    modelBaseUrl: () => "https://chatgpt.com/backend-api",
    thinkingLevel: () => "medium",
    contextWindow: () => 1_000_000,
    getContextUsage: () => harness.context,
    getEntries: () => harness.entries,
    getLeafId: () => harness.leafId,
    getAuth: async () => ({ auth: { apiKey: "tok" } }),
    ...overrides,
  };

  const state = new FooterState(services, {
    requestRender: () => {
      harness.renders++;
    },
    now: () => harness.clock,
  });
  harness.state = state;
  return harness;
}

afterEach(() => {
  // Avoid leaking pending timers across tests.
});

describe("FooterState — stale-while-revalidate and single-flight", () => {
  test("renders synchronously and kicks background Git refresh exactly once", async () => {
    const h = makeHarness();
    const line = h.state.render(100, plainTheme);
    expect(line).toContain("gpt-5.6-sol");
    expect(h.execCalls.length).toBe(1); // rev-parse only (diff not yet fetched)

    await flush();
    // Bootstrap + render triggered one refresh; the diff follows.
    expect(h.execCalls.some((c) => c[1] === "diff")).toBe(true);
  });

  test("concurrent renders trigger only one rev-parse and one diff", async () => {
    const h = makeHarness();
    for (let i = 0; i < 10; i++) h.state.render(120, plainTheme);
    await flush();
    expect(h.execCalls.filter((c) => c[1] === "rev-parse").length).toBe(1);
    expect(h.execCalls.filter((c) => c[1] === "diff").length).toBe(1);
  });

  test("diff refreshes after TTL elapses", async () => {
    const h = makeHarness();
    h.state.render(120, plainTheme);
    await flush();
    expect(h.execCalls.filter((c) => c[1] === "diff").length).toBe(1);

    h.clock += GIT_DIFF_TTL_MS + 1;
    h.state.render(120, plainTheme);
    await flush();
    expect(h.execCalls.filter((c) => c[1] === "diff").length).toBe(2);
  });

  test("renders within TTL do not re-run Git", async () => {
    const h = makeHarness();
    h.state.render(120, plainTheme);
    await flush();
    for (let i = 0; i < 5; i++) h.state.render(120, plainTheme);
    expect(h.execCalls.filter((c) => c[1] === "diff").length).toBe(1);
  });

  test("a failed diff is not retried during the negative TTL", async () => {
    let diffCalls = 0;
    const h = makeHarness({
      exec: async (_command, args) => {
        if (args[0] === "rev-parse") return { stdout: "C:/work/Trinity\n", stderr: "", code: 0 };
        diffCalls++;
        return { stdout: "", stderr: "transient failure", code: 1 };
      },
    });

    h.state.render(120, plainTheme);
    await flush();
    expect(diffCalls).toBe(1);

    h.state.render(120, plainTheme);
    await flush();
    expect(diffCalls).toBe(1);

    h.clock += GIT_ERROR_TTL_MS + 1;
    h.state.render(120, plainTheme);
    await flush();
    expect(diffCalls).toBe(2);
  });

  test("render cache avoids recomposition within a revision", () => {
    const h = makeHarness();
    const a = h.state.render(120, plainTheme);
    const b = h.state.render(120, plainTheme);
    expect(a).toBe(b);
  });

  test("invalidate clears the render cache", () => {
    const h = makeHarness();
    h.state.render(120, plainTheme);
    h.state.invalidate();
    expect(h.state.render(120, plainTheme)).toBeTruthy();
  });

  test("dispose aborts in-flight work and no-ops late updates", async () => {
    const h = makeHarness();
    h.state.render(120, plainTheme);
    h.state.dispose();
    expect(h.signals.every((s) => !s || s.aborted)).toBe(true);
    // Subsequent calls are inert.
    h.state.markGitStale();
    h.state.updateModel("openai", "deepseek-v4");
    const renders = h.renders;
    await Promise.resolve();
    expect(h.renders).toBe(renders);
  });
});

describe("FooterState — session usage cache", () => {
  test("totals update only when the session key changes", () => {
    const h = makeHarness();
    h.entries = [assistant(USAGE({ input: 1000, cost: 0.05 }))];
    h.state.refreshUsage();
    expect(h.state.getSnapshot().usage.sessionCost).toBe(0.05);

    // Same entry count + leaf: cached totals, mutation ignored.
    h.entries = [assistant(USAGE({ input: 9999, cost: 0.99 }))];
    h.state.refreshUsage();
    expect(h.state.getSnapshot().usage.sessionCost).toBe(0.05);

    // Leaf change forces recomputation.
    h.leafId = "leaf-2";
    h.state.refreshUsage();
    expect(h.state.getSnapshot().usage.sessionCost).toBe(0.99);
  });

  test("snapshot cache hit rate is session-wide", () => {
    const h = makeHarness();
    h.entries = [assistant(USAGE({ input: 0, cacheRead: 35000, cacheWrite: 0 }))];
    h.state.refreshUsage();
    expect(h.state.getSnapshot().usage.cacheHitPercent).toBe(100);

    h.entries = [assistant(USAGE({ input: 65000, cacheRead: 35000 }))];
    h.leafId = "leaf-2";
    h.state.refreshUsage();
    expect(h.state.getSnapshot().usage.cacheHitPercent).toBe(35);
  });

  test("zero-denominator hit rate renders as unavailable", () => {
    const h = makeHarness();
    h.state.refreshUsage(); // no entries
    const snap = h.state.getSnapshot();
    expect(snap.usage.cacheHitPercent).toBeNull();
  });
});

describe("FooterState — quota bootstrap", () => {
  test("derives the usage endpoint from the active model base URL", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return {
        status: 200,
        ok: true,
        url: requestedUrl,
        text: async () => JSON.stringify({
          rate_limit: {
            primary_window: {
              used_percent: 2,
              limit_window_seconds: 604800,
              reset_at: 1750000000,
            },
          },
        }),
      } as Response;
    }) as typeof fetch;

    const h = makeHarness();
    try {
      h.state.bootstrapQuota();
      await flush();
      expect(requestedUrl).toBe("https://chatgpt.com/backend-api/wham/usage");
      expect(h.state.getSnapshot().quota?.usedPercent).toBe(2);
    } finally {
      h.state.dispose();
      globalThis.fetch = originalFetch;
    }
  });

  test("a failed bootstrap is not retried during the negative TTL", async () => {
    const originalFetch = globalThis.fetch;
    let authCalls = 0;
    let fetchCalls = 0;
    globalThis.fetch = (async (input) => {
      fetchCalls++;
      return {
        status: 401,
        ok: false,
        url: String(input),
        text: async () => "{}",
      } as Response;
    }) as typeof fetch;

    const h = makeHarness({
      getAuth: async () => {
        authCalls++;
        return { auth: { apiKey: "tok" } };
      },
    });
    try {
      h.state.bootstrapQuota();
      await flush();
      h.state.bootstrapQuota();
      await flush();
      expect(authCalls).toBe(1);
      expect(fetchCalls).toBe(1);
    } finally {
      h.state.dispose();
      globalThis.fetch = originalFetch;
    }
  });
});

describe("FooterState — model/effort/branch updates", () => {
  test("switching away from codex renders cost", () => {
    const h = makeHarness();
    expect(h.state.render(200, plainTheme)).toContain("7d ");
    h.state.updateModel("openai", "gpt-5.5");
    const line = h.state.render(200, plainTheme);
    expect(line).toContain("cost $0.000");
    expect(line).not.toContain("7d ");
  });

  test("updateBranch triggers a re-render", async () => {
    const h = makeHarness();
    h.state.render(120, plainTheme);
    await flush();
    expect(h.state.getSnapshot().repo?.name).toBe("Trinity");
    const before = h.renders;
    h.state.updateBranch("dev");
    expect(h.renders).toBeGreaterThan(before);
    expect(h.state.getSnapshot().repo?.branch).toBe("dev");
  });

  test("effort updates render immediately", () => {
    const h = makeHarness();
    h.state.updateEffort("high");
    expect(h.state.render(200, plainTheme)).toContain(" | high | ");
  });
});
