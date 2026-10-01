/**
 * footer-format.ts — pure formatting, segment building, responsive layout.
 *
 * No I/O here: everything is derived from a FooterSnapshot (defined in
 * footer-state.ts) and a minimal theme handle. ANSI width handling uses
 * visibleWidth/truncateToWidth from @earendil-works/pi-tui.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { FooterSnapshot } from "./footer-state.ts";

/** A single styled piece of text. `color` undefined -> plain text. */
export interface Piece {
  text: string;
  color?: ThemeColor;
}

/** A segment is a list of pieces rendered consecutively. */
export type Segment = Piece[];

/** Only the theme surface the footer needs. */
export type FooterTheme = Pick<Theme, "fg" | "name">;

export const SEPARATOR: Piece = { text: " | ", color: "dim" };

const ITALIAN_MONTHS = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

const EFFORT_COLORS: Record<string, ThemeColor> = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "syntaxFunction",
  xhigh: "thinkingXhigh",
  max: "thinkingMax",
};

// ---------------------------------------------------------------------------
// Primitive formatters
// ---------------------------------------------------------------------------

/** 999, 1k, 1.5k, 35k, 999k, 1m, 1.2m (lowercase, no trailing ".0"). */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "?";
  const r = Math.round(n);
  if (r < 1000) return `${r}`;
  if (r < 1_000_000) {
    // One decimal max; floor at the tenth so 999_999 stays in k range.
    const tenths = Math.floor((r / 1000) * 10) / 10;
    return `${Number.isInteger(tenths) ? tenths : tenths.toFixed(1)}k`;
  }
  const m = Math.floor((r / 1_000_000) * 10) / 10;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
}

/** $0.000 .. $9.999 -> 3 decimals; >= $10 -> 2 decimals. */
export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost < 0) return "$0.000";
  if (cost < 10) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** Rounded integer percent; null/unknown -> "—". */
export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "—";
  return `${Math.round(percent)}%`;
}

/** Unix epoch seconds -> "@set 4" (Italian, no dot). Empty when absent/invalid. */
export function formatResetAt(resetAt: number | null | undefined): string {
  if (resetAt === null || resetAt === undefined || !Number.isFinite(resetAt) || resetAt <= 0) return "";
  const d = new Date(resetAt * 1000);
  if (Number.isNaN(d.getTime())) return "";
  return `@${ITALIAN_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Strip control characters and collapse whitespace to a single line. */
export function sanitizeLine(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Session-wide cache hit rate, or null when the denominator is zero. */
export function cacheHitRate(input: number, cacheRead: number, cacheWrite: number): number | null {
  const denominator = input + cacheRead + cacheWrite;
  if (!(denominator > 0)) return null;
  return (cacheRead / denominator) * 100;
}

export function effortColor(effort: string): ThemeColor {
  return EFFORT_COLORS[effort] ?? "thinkingMedium";
}

export function contextColor(percent: number | null): ThemeColor {
  if (percent === null) return "text";
  if (percent >= 90) return "error";
  if (percent >= 70) return "warning";
  return "text";
}

export function quotaColor(percent: number | null): ThemeColor {
  if (percent === null) return "muted";
  if (percent >= 75) return "error";
  if (percent >= 50) return "warning";
  return "success";
}

// ---------------------------------------------------------------------------
// Segment builders
// ---------------------------------------------------------------------------

export function modelSegment(snapshot: FooterSnapshot): Segment {
  const id = sanitizeLine(snapshot.modelId) || "no-model";
  return [{ text: id, color: "accent" }];
}

export function effortSegment(snapshot: FooterSnapshot): Segment {
  const effort = sanitizeLine(snapshot.effort) || "off";
  return [{ text: effort, color: effortColor(effort) }];
}

/** project@branch (+A -D); null when cwd is not a Git repository. */
export function gitSegment(snapshot: FooterSnapshot, compact = false): Segment | null {
  const repo = snapshot.repo;
  if (!repo) return null;
  const pieces: Segment = [
    { text: sanitizeLine(repo.name) || "repo", color: "text" },
    { text: `@${sanitizeLine(repo.branch ?? "detached")}`, color: "syntaxVariable" },
  ];
  if (!compact && repo.hasHead) {
    pieces.push(
      { text: " (+", color: "dim" },
      { text: `${repo.additions}`, color: "success" },
      { text: " -", color: "dim" },
      { text: `${repo.deletions}`, color: "error" },
      { text: ")", color: "dim" },
    );
  }
  return pieces;
}

/** 35k/1m (3%) — tokens unknown after compaction -> ?/1m (?). */
export function contextSegment(snapshot: FooterSnapshot): Segment {
  const { tokens, maxTokens, percent } = snapshot.context;
  const t = tokens === null || tokens === undefined ? "?" : formatTokens(tokens);
  const m = maxTokens > 0 ? formatTokens(maxTokens) : "?";
  const p = percent === null || percent === undefined ? "?" : formatPercent(percent);
  return [{ text: `${t}/${m} (${p})`, color: contextColor(percent ?? null) }];
}

/** cache 35k↓/0↑ (100%) — session totals, aggregated hit rate. */
export function cacheSegment(snapshot: FooterSnapshot): Segment {
  const { cacheRead, cacheWrite, cacheHitPercent } = snapshot.usage;
  const hitColor = cacheHitPercent !== null && cacheHitPercent >= 90 ? "success" : "text";
  return [
    { text: "cache ", color: "dim" },
    { text: formatTokens(cacheRead), color: "syntaxType" },
    { text: "↓/", color: "dim" },
    { text: formatTokens(cacheWrite), color: "syntaxNumber" },
    { text: "↑ ", color: "dim" },
    { text: `(${cacheHitPercent === null ? "—" : formatPercent(cacheHitPercent)})`, color: hitColor },
  ];
}

/** 7d 1% @set 4; compact drops the reset. Unavailable -> 7d —. */
export function quotaSegment(snapshot: FooterSnapshot, compact = false): Segment {
  const q = snapshot.quota;
  const percent = q ? q.usedPercent : null;
  const pieces: Segment = [
    { text: "7d ", color: "dim" },
    { text: percent === null ? "—" : formatPercent(percent), color: quotaColor(percent) },
  ];
  if (!compact) {
    const reset = q ? formatResetAt(q.resetAt) : "";
    if (reset) pieces.push({ text: ` ${reset}`, color: "muted" });
  }
  return pieces;
}

/** cost $0.123 — cumulative session cost for non-Codex providers. */
export function costSegment(snapshot: FooterSnapshot): Segment {
  return [
    { text: "cost ", color: "muted" },
    { text: formatCost(snapshot.usage.sessionCost), color: "syntaxNumber" },
  ];
}

// ---------------------------------------------------------------------------
// Variants and final line assembly
// ---------------------------------------------------------------------------

export type FooterMode = "quota" | "cost";

/**
 * Ordered degradation list (section 10.2 of the plan). Every variant keeps the
 * original segment order; missing segments (e.g. no repo) are simply absent.
 */
export function buildVariants(snapshot: FooterSnapshot, mode: FooterMode): Segment[][] {
  const last = mode === "quota" ? quotaSegment(snapshot) : costSegment(snapshot);
  const lastCompact = mode === "quota" ? quotaSegment(snapshot, true) : last;

  const model = modelSegment(snapshot);
  const effort = effortSegment(snapshot);
  const gitFull = gitSegment(snapshot);
  const gitCompact = gitSegment(snapshot, true);
  const context = contextSegment(snapshot);
  const cache = cacheSegment(snapshot);

  const present = (variants: (Segment | null)[][]): Segment[][] =>
    variants.map((v) => v.filter((s): s is Segment => s !== null));

  return present([
    // 1. full
    [model, effort, gitFull, context, cache, last],
    // 2. hide cache
    [model, effort, gitFull, context, last],
    // 3. simplify git (drop +A -D)
    [model, effort, gitCompact, context, last],
    // 4. hide git
    [model, effort, context, last],
    // 5. compact quota (cost unchanged)
    [model, effort, context, lastCompact],
    // 6. hide effort
    [model, context, lastCompact],
    // 7. hide quota/cost
    [model, context],
    // 8. hide context
    [model],
  ]);
}

/** Join segments with " | " separators, only between present segments. */
export function joinSegments(segments: Segment[]): Segment {
  const out: Segment = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) out.push(SEPARATOR);
    out.push(...segments[i]);
  }
  return out;
}

/** Render pieces (incl. separators) as plain text — used by tests and truncation. */
export function piecesToText(pieces: Piece[]): string {
  return pieces.map((p) => p.text).join("");
}

/** Apply theme colors to every piece. */
export function styleSegments(theme: FooterTheme, segments: Segment[]): string {
  let out = "";
  for (const segment of segments) {
    for (const piece of segment) {
      out += piece.color ? theme.fg(piece.color, piece.text) : piece.text;
    }
  }
  return out;
}

/**
 * Render the footer line for a given width: pick the first variant whose
 * visible width fits, otherwise truncate the model with an ANSI-safe ellipsis.
 * The result never exceeds `width` visible columns.
 */
export function renderFooterLine(
  snapshot: FooterSnapshot,
  theme: FooterTheme,
  width: number,
  mode: FooterMode,
): string {
  for (const variant of buildVariants(snapshot, mode)) {
    const line = styleSegments(theme, [joinSegments(variant)]);
    if (visibleWidth(line) <= width) return line;
  }
  const model = styleSegments(theme, [joinSegments([modelSegment(snapshot)])]);
  return truncateToWidth(model, width, "…");
}
