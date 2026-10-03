/**
 * openai-quota.ts — Codex weekly quota parsing and best-effort bootstrap.
 *
 * Sources, in order:
 *  1. in-memory cache (footer-state)
 *  2. response headers from after_provider_response (primary source)
 *  3. authenticated bootstrap GET to the usage endpoint (best-effort)
 *
 * Nothing here throws into the TUI; every parser returns null on unexpected
 * input and no credentials or bodies are ever logged.
 */
export interface QuotaData {
  usedPercent: number;
  windowMinutes: number;
  resetAt: number | null;
}

const WEEKLY_MINUTES = 7 * 24 * 60; // 10080
const WEEKLY_SECONDS = WEEKLY_MINUTES * 60; // 604800
const WEEKLY_TOLERANCE = 0.05;

export function isWeeklyWindow(minutes: number): boolean {
  return Math.abs(minutes - WEEKLY_MINUTES) <= WEEKLY_MINUTES * WEEKLY_TOLERANCE;
}

export function isWeeklyWindowSeconds(seconds: number): boolean {
  return Math.abs(seconds - WEEKLY_SECONDS) <= WEEKLY_SECONDS * WEEKLY_TOLERANCE;
}

/** Unix epoch seconds; null when absent or not a plausible positive number. */
export function parseEpochSeconds(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Header parsing (x-codex-{primary,secondary}-*)
// ---------------------------------------------------------------------------

const HEADER_FAMILIES = ["primary", "secondary"] as const;

/**
 * Parse the Codex quota headers. Both families are examined; only windows of
 * about seven days are accepted, preferring primary on a tie.
 */
export function parseQuotaHeaders(headers: Record<string, string>): QuotaData | null {
  const lower = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) lower.set(key.toLowerCase(), value);

  const candidates: { data: QuotaData; primary: boolean }[] = [];
  for (const family of HEADER_FAMILIES) {
    const usedRaw = lower.get(`x-codex-${family}-used-percent`);
    const windowRaw = lower.get(`x-codex-${family}-window-minutes`);
    const resetRaw = lower.get(`x-codex-${family}-reset-at`);
    if (usedRaw === undefined || windowRaw === undefined) continue;
    const usedPercent = Number(usedRaw);
    const windowMinutes = Number(windowRaw);
    if (!Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) continue;
    if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) continue;
    if (!isWeeklyWindow(windowMinutes)) continue;
    candidates.push({
      data: { usedPercent, windowMinutes, resetAt: parseEpochSeconds(resetRaw) },
      primary: family === "primary",
    });
  }
  if (candidates.length === 0) return null;
  const chosen = candidates.find((c) => c.primary) ?? candidates[0];
  return chosen.data;
}

// ---------------------------------------------------------------------------
// Usage endpoint payload parsing (snake_case)
// ---------------------------------------------------------------------------

interface WindowLike {
  used_percent?: unknown;
  limit_window_seconds?: unknown;
  reset_at?: unknown;
}

interface RateLimitLike {
  primary_window?: unknown;
  secondary_window?: unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function asWindow(value: unknown): WindowLike | null {
  return asObject(value) as WindowLike | null;
}

interface Candidate {
  data: QuotaData;
  primary: boolean;
}

function collectWindow(value: unknown, primary: boolean, out: Candidate[]): void {
  const window = asWindow(value);
  if (!window) return;
  const usedPercent = toFiniteNumber(window.used_percent);
  const seconds = toFiniteNumber(window.limit_window_seconds);
  if (usedPercent === null || seconds === null) return;
  if (!isWeeklyWindowSeconds(seconds)) return;
  out.push({
    data: { usedPercent, windowMinutes: seconds / 60, resetAt: parseEpochSeconds(window.reset_at) },
    primary,
  });
}

/**
 * Parse the authenticated usage endpoint payload. Accepts the nested
 * `rate_limit.{primary,secondary}_window` shape plus a top-level fallback.
 */
export function parseUsagePayload(body: unknown): QuotaData | null {
  if (typeof body !== "object" || body === null) return null;
  const root = body as Record<string, unknown>;

  const candidates: Candidate[] = [];
  const rateLimit = asObject(root.rate_limit) as RateLimitLike | null;
  if (rateLimit) {
    collectWindow(rateLimit.primary_window, true, candidates);
    collectWindow(rateLimit.secondary_window, false, candidates);
  }
  if (candidates.length === 0) {
    const usedPercent = toFiniteNumber(root.used_percent);
    const seconds = toFiniteNumber(root.limit_window_seconds);
    if (usedPercent !== null && seconds !== null && isWeeklyWindowSeconds(seconds)) {
      candidates.push({
        data: { usedPercent, windowMinutes: seconds / 60, resetAt: parseEpochSeconds(root.reset_at) },
        primary: true,
      });
    }
  }
  if (candidates.length === 0) return null;
  const chosen = candidates.find((c) => c.primary) ?? candidates[0];
  return chosen.data;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export interface AuthLike {
  apiKey?: string;
  headers?: Record<string, string | null>;
}

/** Extract the raw access token from a resolved ModelAuth-like object. */
export function extractAccessToken(auth: AuthLike): string | null {
  const headers = auth.headers ?? {};
  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization === "string" && authorization.trim()) {
    return authorization.replace(/^Bearer\s+/i, "").trim() || null;
  }
  if (typeof auth.apiKey === "string" && auth.apiKey.trim()) return auth.apiKey.trim();
  return null;
}

/** Robust Base64URL decoder for the JWT payload segment. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const parsed = JSON.parse(atob(padded)) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extract the ChatGPT account id from the OAuth JWT. Claim lives under
 * `https://api.openai.com/auth.chatgpt_account_id`; accept nested, flat and
 * top-level spellings.
 */
export function extractChatgptAccountId(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload) return undefined;

  const nested = payload["https://api.openai.com/auth"];
  if (typeof nested === "object" && nested !== null) {
    const id = (nested as Record<string, unknown>).chatgpt_account_id;
    if (typeof id === "string" && id) return id;
  }
  const flat = payload["https://api.openai.com/auth.chatgpt_account_id"];
  if (typeof flat === "string" && flat) return flat;
  const top = payload.chatgpt_account_id;
  if (typeof top === "string" && top) return top;
  return undefined;
}

/**
 * Derive the usage endpoint from the model base URL:
 *  - base containing /backend-api -> /wham/usage
 *  - any other Codex base          -> /api/codex/usage
 */
export function buildUsageUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/backend-api")) return `${base}/wham/usage`;
  return `${base}/api/codex/usage`;
}

// ---------------------------------------------------------------------------
// Authenticated bootstrap fetch (best-effort)
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 3000;

export interface FetchQuotaOptions {
  token: string;
  accountId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchFn?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

/**
 * GET the usage endpoint with a short timeout. Returns null on any failure
 * (auth errors, redirects to unexpected hosts, invalid JSON, oversized
 * bodies, timeouts) — callers keep their last valid value.
 */
export async function fetchQuota(options: FetchQuotaOptions): Promise<QuotaData | null> {
  const url = buildUsageUrl(options.baseUrl);
  if (!url) return null;

  let expectedHost: string;
  try {
    expectedHost = new URL(url).host;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onOuterAbort);
  const doFetch = options.fetchFn ?? globalThis.fetch;

  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${options.token}`,
      accept: "application/json",
    };
    if (options.accountId) headers["chatgpt-account-id"] = options.accountId;

    const res = await doFetch(url, { headers, signal: controller.signal, redirect: "manual" });
    if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429) return null;
    if (!res.ok) return null;

    // Never follow redirects to an unexpected host.
    let finalHost: string;
    try {
      finalHost = new URL(res.url).host;
    } catch {
      return null;
    }
    if (finalHost !== expectedHost) return null;

    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) return null;

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return null;
    }
    return parseUsagePayload(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}
