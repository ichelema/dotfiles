/**
 * footer-state.ts — runtime state, caches and single-flight for the footer.
 *
 * Owns the FooterSnapshot seen by the renderer, TTL caches with
 * stale-while-revalidate, negative caches for transient errors, single-flight
 * for Git/quota work, and session usage aggregation.
 */
import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import { cacheHitRate, renderFooterLine, type FooterTheme, type FooterMode } from "./footer-format.ts";
import {
  getGitDiff,
  repoNameFromRoot,
  resolveRepoRoot,
  type ExecFn,
} from "./git-stats.ts";
import {
  extractAccessToken,
  extractChatgptAccountId,
  fetchQuota,
  parseQuotaHeaders,
  type QuotaData,
} from "./openai-quota.ts";

// ---------------------------------------------------------------------------
// TTLs (section 6.2)
// ---------------------------------------------------------------------------

export const GIT_DIFF_TTL_MS = 1500;
export const GIT_ERROR_TTL_MS = 5000;
export const GIT_TIMEOUT_MS = 3000;
export const QUOTA_TTL_MS = 60_000;
export const QUOTA_ERROR_TTL_MS = 30_000;
export const QUOTA_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Usage aggregation
// ---------------------------------------------------------------------------

export interface UsageTotals {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

interface UsageLike {
  input?: unknown;
  cacheRead?: unknown;
  cacheWrite?: unknown;
  cost?: unknown;
}

/** Loose structural view of a session entry, for aggregation. */
export interface UsageEntryLike {
  type: string;
  message?: { role?: string; usage?: unknown };
  usage?: unknown;
}

function toNonNeg(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function usageCost(value: unknown): number {
  if (typeof value === "number") return toNonNeg(value);
  if (typeof value === "object" && value !== null) {
    const total = (value as { total?: unknown }).total;
    if (typeof total === "number") return toNonNeg(total);
  }
  return 0;
}

/** Usage carried by an entry: assistant/toolResult messages, compaction, branch summary. */
export function entryUsage(entry: UsageEntryLike): UsageLike | null {
  if (entry.type === "message") {
    const message = entry.message;
    if (message && (message.role === "assistant" || message.role === "toolResult")) {
      return (message.usage as UsageLike | undefined) ?? null;
    }
    return null;
  }
  if (entry.type === "compaction" || entry.type === "branch_summary") {
    return (entry.usage as UsageLike | undefined) ?? null;
  }
  return null;
}

/** Session-wide totals across every entry, including abandoned branches. */
export function aggregateUsage(entries: readonly UsageEntryLike[]): UsageTotals {
  let input = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let cost = 0;
  for (const entry of entries) {
    const usage = entryUsage(entry);
    if (!usage) continue;
    input += toNonNeg(usage.input);
    cacheRead += toNonNeg(usage.cacheRead);
    cacheWrite += toNonNeg(usage.cacheWrite);
    cost += usageCost(usage.cost);
  }
  return { input, cacheRead, cacheWrite, cost };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface FooterRepo {
  name: string;
  branch: string | null;
  additions: number;
  deletions: number;
  hasHead: boolean;
}

export interface FooterContext {
  tokens: number | null;
  maxTokens: number;
  percent: number | null;
}

export interface FooterUsage {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPercent: number | null;
  sessionCost: number;
}

export interface FooterSnapshot {
  revision: number;
  modelId: string;
  effort: string;
  repo: FooterRepo | null;
  context: FooterContext;
  usage: FooterUsage;
  quota: QuotaData | null;
}

// ---------------------------------------------------------------------------
// Services injected by index.ts (testable surface)
// ---------------------------------------------------------------------------

export interface ProviderAuthLike {
  auth?: { apiKey?: string; headers?: Record<string, string | null> };
}

export interface FooterServices {
  cwd: string;
  exec: ExecFn;
  modelProvider: () => string | undefined;
  modelId: () => string | undefined;
  modelBaseUrl: () => string | undefined;
  thinkingLevel: () => string | undefined;
  contextWindow: () => number | undefined;
  getContextUsage: () => ContextUsage | undefined;
  getEntries: () => readonly UsageEntryLike[];
  getLeafId: () => string | null;
  getAuth: (provider: string) => Promise<ProviderAuthLike | undefined>;
}

// ---------------------------------------------------------------------------
// FooterState
// ---------------------------------------------------------------------------

export interface FooterStateOptions {
  requestRender?: () => void;
  /** Injectable clock for deterministic TTL tests. */
  now?: () => number;
}

export class FooterState {
  private readonly services: FooterServices;
  private readonly now: () => number;
  private requestRender: () => void;

  private disposed = false;
  private renderCache = new Map<string, string>();
  private abort = new AbortController();

  private revision = 0;

  private isCodex: boolean;
  private modelId: string;
  private effort: string;

  // Git
  private repo: { name: string } | null = null;
  private repoChecked = false;
  private notARepo = false;
  private branch: string | null = null;
  private additions = 0;
  private deletions = 0;
  private hasHead = true;
  private gitFetchedAt = 0;
  private gitErrorAt = 0;
  private gitInFlight: Promise<void> | null = null;

  // Quota
  private quota: QuotaData | null = null;
  private quotaFetchedAt = 0;
  private quotaErrorAt = 0;
  private quotaInFlight: Promise<void> | null = null;
  /** Guards header/bootstrap races: a newer apply wins over an older fetch. */
  private quotaVersion = 0;

  // Session usage
  private usageKey = "";
  private usage: UsageTotals = { input: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

  constructor(services: FooterServices, options?: FooterStateOptions) {
    this.services = services;
    this.requestRender = options?.requestRender ?? (() => {});
    this.now = options?.now ?? Date.now;
    this.isCodex = services.modelProvider() === "openai-codex";
    this.modelId = services.modelId() ?? "no-model";
    this.effort = services.thinkingLevel() ?? "off";
    this.refreshUsage();
  }

  /** Bind the TUI render callback (available only inside the footer factory). */
  setRequestRender(callback: () => void): void {
    this.requestRender = callback;
  }

  /** Kick off background Git resolution and quota bootstrap (session start). */
  bootstrap(): void {
    if (this.disposed) return;
    void this.refreshGit();
    if (this.isCodex) this.bootstrapQuota();
  }

  // -- external updates -----------------------------------------------------

  updateModel(provider: string | undefined, id: string | undefined): void {
    if (this.disposed) return;
    const isCodex = provider === "openai-codex";
    const modelId = id ?? "no-model";
    if (isCodex === this.isCodex && modelId === this.modelId) return;
    this.isCodex = isCodex;
    this.modelId = modelId;
    this.bumpAndRender();
    if (isCodex) this.bootstrapQuota();
  }

  updateEffort(effort: string | undefined): void {
    if (this.disposed) return;
    const level = effort ?? "off";
    if (level === this.effort) return;
    this.effort = level;
    this.bumpAndRender();
  }

  updateBranch(branch: string | null): void {
    if (this.disposed) return;
    if (branch === this.branch) return;
    this.branch = branch;
    // The diff vs HEAD is relative to the current branch.
    this.gitFetchedAt = 0;
    this.bumpAndRender();
  }

  /** Usage/context changed (message, compaction, tree navigation). */
  onSessionDataChanged(): void {
    if (this.disposed) return;
    this.refreshUsage();
    this.bumpAndRender();
  }

  /** Called after write/edit/bash: invalidate the cached diff. */
  markGitStale(): void {
    if (this.disposed) return;
    this.gitFetchedAt = 0;
  }

  /** New quota from response headers (primary source, no extra requests). */
  handleQuotaHeaders(headers: Record<string, string>): void {
    if (this.disposed || !this.isCodex) return;
    const data = parseQuotaHeaders(headers);
    if (!data) return;
    this.quota = data;
    this.quotaFetchedAt = this.now();
    this.quotaErrorAt = 0;
    this.quotaVersion++;
    this.bumpAndRender();
  }

  /** Start a quota bootstrap only when stale/missing and not already in flight. */
  bootstrapQuota(): void {
    if (this.disposed || !this.isCodex) return;
    if (this.quotaInFlight) return;
    if (this.quota && this.now() - this.quotaFetchedAt < QUOTA_TTL_MS) return;
    if (this.now() < this.quotaErrorAt) return;
    void this.refreshQuota();
  }

  // -- rendering ------------------------------------------------------------

  /**
   * Synchronous, await-free render. Uses the last valid data and kicks off
   * background refreshes when caches are stale (stale-while-revalidate).
   */
  render(width: number, theme: FooterTheme): string {
    this.maybeRefresh();
    const key = `${width}|${this.revision}|${theme.name ?? ""}`;
    const cached = this.renderCache.get(key);
    if (cached !== undefined) return cached;
    const line = renderFooterLine(this.getSnapshot(), theme, width, this.footerMode());
    if (this.renderCache.size > 64) this.renderCache.clear();
    this.renderCache.set(key, line);
    return line;
  }

  /** Clear the render cache (PI calls this on theme changes too). */
  invalidate(): void {
    this.renderCache.clear();
  }

  getSnapshot(): FooterSnapshot {
    const context = this.services.getContextUsage();
    return {
      revision: this.revision,
      modelId: this.modelId,
      effort: this.effort,
      repo: this.repo
        ? {
            name: this.repo.name,
            branch: this.branch,
            additions: this.additions,
            deletions: this.deletions,
            hasHead: this.hasHead,
          }
        : null,
      context: {
        tokens: context?.tokens ?? null,
        maxTokens: context?.contextWindow ?? this.services.contextWindow() ?? 0,
        percent: context?.percent ?? null,
      },
      usage: {
        input: this.usage.input,
        cacheRead: this.usage.cacheRead,
        cacheWrite: this.usage.cacheWrite,
        cacheHitPercent: cacheHitRate(this.usage.input, this.usage.cacheRead, this.usage.cacheWrite),
        sessionCost: this.usage.cost,
      },
      quota: this.quota,
    };
  }

  /** Release everything; late async completions become no-ops. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.requestRender = () => {};
    this.renderCache.clear();
    this.gitInFlight = null;
    this.quotaInFlight = null;
  }

  // -- internals ------------------------------------------------------------

  private footerMode(): FooterMode {
    return this.isCodex ? "quota" : "cost";
  }

  private bumpAndRender(): void {
    this.revision++;
    this.renderCache.clear();
    this.requestRender();
  }

  /** Called after message/compaction/tree events; recomputes usage totals. */
  refreshUsage(): void {
    const key = `${this.services.getEntries().length}:${this.services.getLeafId()}`;
    if (key === this.usageKey) return; // O(1) hit on unchanged sessions
    this.usageKey = key;
    const totals = aggregateUsage(this.services.getEntries());
    if (
      totals.input !== this.usage.input ||
      totals.cacheRead !== this.usage.cacheRead ||
      totals.cacheWrite !== this.usage.cacheWrite ||
      totals.cost !== this.usage.cost
    ) {
      this.usage = totals;
      this.bumpAndRender();
    }
  }

  private maybeRefresh(): void {
    if (this.disposed) return;
    const now = this.now();

    if (!this.gitInFlight && !this.notARepo && now >= this.gitErrorAt) {
      if (!this.repoChecked || now - this.gitFetchedAt > GIT_DIFF_TTL_MS) {
        void this.refreshGit();
      }
    }

    if (!this.quotaInFlight && this.isCodex && now >= this.quotaErrorAt) {
      if (!this.quota || now - this.quotaFetchedAt > QUOTA_TTL_MS) {
        void this.refreshQuota();
      }
    }
  }

  private refreshGit(): Promise<void> {
    if (this.gitInFlight) return this.gitInFlight;
    const promise = this.doRefreshGit().finally(() => {
      this.gitInFlight = null;
    });
    this.gitInFlight = promise;
    return promise;
  }

  private async doRefreshGit(): Promise<void> {
    if (this.disposed || this.notARepo) return;
    try {
      if (!this.repoChecked) {
        if (this.now() < this.gitErrorAt) return;
        const resolved = await resolveRepoRoot(this.services.exec, this.services.cwd, {
          signal: this.abort.signal,
          timeout: GIT_TIMEOUT_MS,
        });
        if (this.disposed) return;
        if (resolved.kind === "repo") {
          // The toplevel is used only for the display name; the diff runs in
          // the session cwd because git's MSYS-style paths are not usable as
          // a process cwd on Windows.
          this.repo = { name: repoNameFromRoot(resolved.root) };
          this.repoChecked = true;
        } else if (resolved.kind === "not-repo") {
          this.notARepo = true;
          this.repoChecked = true;
          return;
        } else {
          this.gitErrorAt = this.now() + GIT_ERROR_TTL_MS;
          return;
        }
      }
      if (!this.repo) return;

      const diff = await getGitDiff(this.services.exec, this.services.cwd, {
        signal: this.abort.signal,
        timeout: GIT_TIMEOUT_MS,
      });
      if (this.disposed) return;
      if (diff.kind === "ok") {
        this.additions = diff.totals.additions;
        this.deletions = diff.totals.deletions;
        this.hasHead = true;
        this.gitFetchedAt = this.now();
        this.bumpAndRender();
      } else if (diff.kind === "no-head") {
        this.hasHead = false;
        this.gitFetchedAt = this.now();
        this.bumpAndRender();
      } else {
        this.gitErrorAt = this.now() + GIT_ERROR_TTL_MS;
      }
    } catch {
      if (!this.disposed) this.gitErrorAt = this.now() + GIT_ERROR_TTL_MS;
    }
  }

  private refreshQuota(): Promise<void> {
    if (this.quotaInFlight) return this.quotaInFlight;
    const promise = this.doRefreshQuota().finally(() => {
      this.quotaInFlight = null;
    });
    this.quotaInFlight = promise;
    return promise;
  }

  private async doRefreshQuota(): Promise<void> {
    const version = this.quotaVersion;
    const startedAt = this.now();
    try {
      const auth = await this.services.getAuth("openai-codex");
      if (this.disposed) return;
      if (!auth) {
        this.quotaErrorAt = this.now() + QUOTA_ERROR_TTL_MS;
        return;
      }
      const token = extractAccessToken(auth.auth ?? {});
      if (!token) {
        this.quotaErrorAt = this.now() + QUOTA_ERROR_TTL_MS;
        return;
      }
      const data = await fetchQuota({
        token,
        accountId: extractChatgptAccountId(token),
        baseUrl: this.services.modelBaseUrl(),
        signal: this.abort.signal,
        timeoutMs: QUOTA_TIMEOUT_MS,
      });
      if (this.disposed) return;
      if (!data) {
        this.quotaErrorAt = this.now() + QUOTA_ERROR_TTL_MS;
        return;
      }
      if (this.quotaVersion !== version) return; // newer header/bootstrap won
      this.quota = data;
      this.quotaFetchedAt = startedAt;
      this.quotaErrorAt = 0;
      this.quotaVersion++;
      this.bumpAndRender();
    } catch {
      if (!this.disposed) this.quotaErrorAt = this.now() + QUOTA_ERROR_TTL_MS;
    }
  }
}
