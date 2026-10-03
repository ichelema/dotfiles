/**
 * Tests for footer-format.ts — pure formatting and responsive layout.
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { FooterSnapshot } from "../footer-state.ts";
import {
  buildVariants,
  cacheHitRate,
  contextColor,
  effortColor,
  formatCost,
  formatPercent,
  formatResetAt,
  formatTokens,
  joinSegments,
  piecesToText,
  quotaColor,
  renderFooterLine,
  sanitizeLine,
  styleSegments,
} from "../footer-format.ts";

/** Minimal theme: wraps every styled piece in a short ANSI sequence. */
const fakeTheme = {
  name: "test",
  fg: (_color: string, text: string) => `\x1b[31m${text}\x1b[39m`,
};

/** Theme that returns plain text — used for exact-string assertions. */
const plainTheme = {
  name: "plain",
  fg: (_color: string, text: string) => text,
};

function snapshot(overrides?: Partial<FooterSnapshot>): FooterSnapshot {
  return {
    revision: 1,
    modelId: "gpt-5.6-sol",
    effort: "medium",
    repo: { name: "Trinity", branch: "main", additions: 12, deletions: 3, hasHead: true },
    context: { tokens: 35000, maxTokens: 1_000_000, percent: 3 },
    usage: { input: 65000, cacheRead: 35000, cacheWrite: 0, cacheHitPercent: 35, sessionCost: 0.123 },
    quota: { usedPercent: 1, windowMinutes: 10080, resetAt: new Date(2026, 8, 4, 12).getTime() / 1000 },
    ...overrides,
  };
}

function variantText(snap: FooterSnapshot, mode: "quota" | "cost", index: number): string {
  const variants = buildVariants(snap, mode);
  return piecesToText(joinSegments(variants[index]));
}

describe("formatTokens", () => {
  test("boundaries and formats", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(35000)).toBe("35k");
    expect(formatTokens(999000)).toBe("999k");
    expect(formatTokens(1000000)).toBe("1m");
    expect(formatTokens(1200000)).toBe("1.2m");
    expect(formatTokens(1500000)).toBe("1.5m");
  });

  test("never rounds up into the next unit", () => {
    expect(formatTokens(999499)).toBe("999.4k");
    expect(formatTokens(999999)).toBe("999.9k");
    expect(formatTokens(1999999)).toBe("1.9m");
  });

  test("invalid input", () => {
    expect(formatTokens(Number.NaN)).toBe("?");
    expect(formatTokens(-5)).toBe("?");
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("?");
  });
});

describe("formatCost", () => {
  test("decimal rules", () => {
    expect(formatCost(0)).toBe("$0.000");
    expect(formatCost(0.123)).toBe("$0.123");
    expect(formatCost(9.999)).toBe("$9.999");
    expect(formatCost(10)).toBe("$10.00");
    expect(formatCost(123.456)).toBe("$123.46");
  });

  test("invalid input clamps to zero", () => {
    expect(formatCost(Number.NaN)).toBe("$0.000");
    expect(formatCost(-1)).toBe("$0.000");
  });
});

describe("formatPercent", () => {
  test("rounding", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(3.4)).toBe("3%");
    expect(formatPercent(3.5)).toBe("4%");
    expect(formatPercent(100)).toBe("100%");
  });

  test("unknown", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("cacheHitRate", () => {
  test("zero denominator is unavailable", () => {
    expect(cacheHitRate(0, 0, 0)).toBeNull();
  });

  test("read-only session hits 100%", () => {
    expect(cacheHitRate(0, 35000, 0)).toBe(100);
  });

  test("aggregated rate", () => {
    expect(cacheHitRate(65000, 35000, 0)).toBe(35);
    expect(cacheHitRate(60000, 35000, 5000)).toBe(35);
  });
});

describe("formatResetAt", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime() / 1000;

  test("all months", () => {
    const months = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    months.forEach((abbr, i) => {
      expect(formatResetAt(at(2026, i, 4))).toBe(`@${abbr} 4`);
    });
  });

  test("leap day", () => {
    expect(formatResetAt(at(2028, 1, 29))).toBe("@feb 29");
  });

  test("absent or invalid", () => {
    expect(formatResetAt(null)).toBe("");
    expect(formatResetAt(undefined)).toBe("");
    expect(formatResetAt(0)).toBe("");
    expect(formatResetAt(-5)).toBe("");
    expect(formatResetAt(Number.NaN)).toBe("");
  });
});

describe("sanitizeLine", () => {
  test("strips control characters and collapses whitespace", () => {
    expect(sanitizeLine("a\nb\tc")).toBe("a b c");
    expect(sanitizeLine("  hi   there  ")).toBe("hi there");
    expect(sanitizeLine("a\u0000b\u001bb")).toBe("a b b");
    expect(sanitizeLine("uni—cøde ✓")).toBe("uni—cøde ✓");
  });
});

describe("color selection", () => {
  test("effort colors stay readable on the Nord background", () => {
    expect(effortColor("off")).toBe("thinkingOff");
    expect(effortColor("high")).toBe("syntaxFunction");
    expect(effortColor("max")).toBe("thinkingMax");
    expect(effortColor("unknown")).toBe("thinkingMedium");
  });

  test("context thresholds", () => {
    expect(contextColor(null)).toBe("text");
    expect(contextColor(69)).toBe("text");
    expect(contextColor(70)).toBe("warning");
    expect(contextColor(90)).toBe("error");
  });

  test("quota thresholds", () => {
    expect(quotaColor(null)).toBe("muted");
    expect(quotaColor(49)).toBe("success");
    expect(quotaColor(50)).toBe("warning");
    expect(quotaColor(75)).toBe("error");
  });
});

describe("buildVariants (responsive degradation)", () => {
  test("quota mode full line", () => {
    expect(variantText(snapshot(), "quota", 0)).toBe(
      "gpt-5.6-sol | medium | Trinity@main (+12 -3) | 35k/1m (3%) | cache 35k↓/0↑ (35%) | 7d 1% @set 4",
    );
  });

  test("cost mode full line", () => {
    expect(variantText(snapshot(), "cost", 0)).toBe(
      "gpt-5.6-sol | medium | Trinity@main (+12 -3) | 35k/1m (3%) | cache 35k↓/0↑ (35%) | cost $0.123",
    );
  });

  test("level 2 hides cache", () => {
    expect(variantText(snapshot(), "quota", 1)).toBe(
      "gpt-5.6-sol | medium | Trinity@main (+12 -3) | 35k/1m (3%) | 7d 1% @set 4",
    );
  });

  test("level 3 simplifies git", () => {
    expect(variantText(snapshot(), "quota", 2)).toBe(
      "gpt-5.6-sol | medium | Trinity@main | 35k/1m (3%) | 7d 1% @set 4",
    );
  });

  test("level 4 hides git", () => {
    expect(variantText(snapshot(), "quota", 3)).toBe(
      "gpt-5.6-sol | medium | 35k/1m (3%) | 7d 1% @set 4",
    );
  });

  test("level 5 compacts quota", () => {
    expect(variantText(snapshot(), "quota", 4)).toBe("gpt-5.6-sol | medium | 35k/1m (3%) | 7d 1%");
  });

  test("level 6 hides effort", () => {
    expect(variantText(snapshot(), "quota", 5)).toBe("gpt-5.6-sol | 35k/1m (3%) | 7d 1%");
  });

  test("level 7 hides quota/cost", () => {
    expect(variantText(snapshot(), "quota", 6)).toBe("gpt-5.6-sol | 35k/1m (3%)");
  });

  test("level 8 keeps only model", () => {
    expect(variantText(snapshot(), "quota", 7)).toBe("gpt-5.6-sol");
  });

  test("cost is not compacted at level 5", () => {
    expect(variantText(snapshot(), "cost", 4)).toBe("gpt-5.6-sol | medium | 35k/1m (3%) | cost $0.123");
  });

  test("no separators when segments are missing", () => {
    const snap = snapshot({ repo: null });
    expect(variantText(snap, "quota", 0)).toBe(
      "gpt-5.6-sol | medium | 35k/1m (3%) | cache 35k↓/0↑ (35%) | 7d 1% @set 4",
    );
    expect(variantText(snap, "quota", 7)).toBe("gpt-5.6-sol");
  });

  test("detached HEAD", () => {
    const snap = snapshot({ repo: { name: "Trinity", branch: null, additions: 1, deletions: 1, hasHead: true } });
    expect(variantText(snap, "quota", 0)).toContain("Trinity@detached (+1 -1)");
  });

  test("no HEAD drops the counters", () => {
    const snap = snapshot({ repo: { name: "Trinity", branch: "main", additions: 0, deletions: 0, hasHead: false } });
    expect(variantText(snap, "quota", 0)).toBe(
      "gpt-5.6-sol | medium | Trinity@main | 35k/1m (3%) | cache 35k↓/0↑ (35%) | 7d 1% @set 4",
    );
  });

  test("unknown context after compaction", () => {
    const snap = snapshot({ context: { tokens: null, maxTokens: 1_000_000, percent: null } });
    expect(variantText(snap, "quota", 0)).toContain("?/1m (?)");
  });

  test("cache with zero denominator", () => {
    const snap = snapshot({
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, cacheHitPercent: null, sessionCost: 0 },
    });
    expect(variantText(snap, "quota", 0)).toContain("cache 0↓/0↑ (—)");
  });

  test("unavailable quota", () => {
    const snap = snapshot({ quota: null });
    expect(variantText(snap, "quota", 0)).toContain("7d —");
  });

  test("quota without reset", () => {
    const snap = snapshot({ quota: { usedPercent: 1, windowMinutes: 10080, resetAt: null } });
    expect(variantText(snap, "quota", 0)).toContain("7d 1%");
    expect(variantText(snap, "quota", 0)).not.toMatch(/@(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic) \d+/);
  });
});

describe("renderFooterLine (width fit)", () => {
  const widths = [160, 120, 100, 80, 60, 40, 20];
  const snap = snapshot();

  test("every line fits within the requested width (ANSI-safe)", () => {
    for (const width of widths) {
      const line = renderFooterLine(snap, fakeTheme, width, "quota");
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });

  test("degradation matches the plan examples", () => {
    const full = renderFooterLine(snapshot(), plainTheme, 160, "quota");
    expect(full).toBe(
      "gpt-5.6-sol | medium | Trinity@main (+12 -3) | 35k/1m (3%) | cache 35k↓/0↑ (35%) | 7d 1% @set 4",
    );
    // A medium terminal drops cache then simplifies git.
    const medium = renderFooterLine(snapshot(), plainTheme, 70, "quota");
    expect(medium).toBe("gpt-5.6-sol | medium | Trinity@main | 35k/1m (3%) | 7d 1% @set 4");
  });

  test("narrow terminal keeps model + context", () => {
    const narrow = renderFooterLine(snapshot(), plainTheme, 30, "quota");
    expect(narrow).toBe("gpt-5.6-sol | 35k/1m (3%)");
  });

  test("extremely narrow truncates with ellipsis", () => {
    const line = renderFooterLine(snap, fakeTheme, 6, "quota");
    expect(visibleWidth(line)).toBeLessThanOrEqual(6);
    expect(line).toContain("…");
  });

  test("zero and tiny widths never overflow", () => {
    expect(visibleWidth(renderFooterLine(snap, fakeTheme, 0, "quota"))).toBe(0);
    expect(visibleWidth(renderFooterLine(snap, fakeTheme, 1, "quota"))).toBeLessThanOrEqual(1);
    expect(visibleWidth(renderFooterLine(snap, fakeTheme, 2, "quota"))).toBeLessThanOrEqual(2);
  });

  test("styling applies theme colors", () => {
    const styled = styleSegments(fakeTheme, [joinSegments(buildVariants(snap, "quota")[0])]);
    expect(styled).toContain("\x1b[31m");
    expect(styled).toContain("\x1b[39m");
  });
});
