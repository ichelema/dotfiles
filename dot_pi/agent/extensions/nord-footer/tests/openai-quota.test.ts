/**
 * Tests for openai-quota.ts — header/payload parsing, JWT, bootstrap fetch.
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import {
  buildUsageUrl,
  decodeJwtPayload,
  extractAccessToken,
  extractChatgptAccountId,
  fetchQuota,
  isWeeklyWindow,
  isWeeklyWindowSeconds,
  parseEpochSeconds,
  parseQuotaHeaders,
  parseUsagePayload,
} from "../openai-quota.ts";

// ---------------------------------------------------------------------------
// Window selection
// ---------------------------------------------------------------------------

describe("weekly window detection", () => {
  test("accepts ~7 days within +/-5%", () => {
    expect(isWeeklyWindow(10080)).toBe(true);
    expect(isWeeklyWindow(10000)).toBe(true);
    expect(isWeeklyWindow(10584)).toBe(true);
    expect(isWeeklyWindow(9576)).toBe(true);
    expect(isWeeklyWindow(9000)).toBe(false);
    expect(isWeeklyWindow(5 * 60)).toBe(false);
    expect(isWeeklyWindowSeconds(604800)).toBe(true);
    expect(isWeeklyWindowSeconds(300000)).toBe(false);
  });
});

describe("parseEpochSeconds", () => {
  test("accepts positive epoch seconds, rejects everything else", () => {
    expect(parseEpochSeconds(1750000000)).toBe(1750000000);
    expect(parseEpochSeconds("1750000000")).toBe(1750000000);
    expect(parseEpochSeconds(0)).toBeNull();
    expect(parseEpochSeconds(-1)).toBeNull();
    expect(parseEpochSeconds(Number.NaN)).toBeNull();
    expect(parseEpochSeconds("abc")).toBeNull();
    expect(parseEpochSeconds(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe("parseQuotaHeaders", () => {
  const weekly = { used: "1.5", window: "10080", reset: "1750000000" };

  test("weekly window in primary family", () => {
    const data = parseQuotaHeaders({
      "x-codex-primary-used-percent": weekly.used,
      "x-codex-primary-window-minutes": weekly.window,
      "x-codex-primary-reset-at": weekly.reset,
    });
    expect(data).toEqual({ usedPercent: 1.5, windowMinutes: 10080, resetAt: 1750000000 });
  });

  test("weekly window in secondary family", () => {
    const data = parseQuotaHeaders({
      "x-codex-primary-used-percent": "10",
      "x-codex-primary-window-minutes": "300", // 5h, not weekly
      "x-codex-secondary-used-percent": weekly.used,
      "x-codex-secondary-window-minutes": weekly.window,
      "x-codex-secondary-reset-at": weekly.reset,
    });
    expect(data?.usedPercent).toBe(1.5);
    expect(data?.windowMinutes).toBe(10080);
  });

  test("header names are case-insensitive", () => {
    const data = parseQuotaHeaders({
      "X-Codex-Primary-Used-Percent": weekly.used,
      "X-Codex-Primary-Window-Minutes": weekly.window,
      "X-Codex-Primary-Reset-At": weekly.reset,
    });
    expect(data?.usedPercent).toBe(1.5);
  });

  test("both weekly -> primary wins", () => {
    const data = parseQuotaHeaders({
      "x-codex-primary-used-percent": "2",
      "x-codex-primary-window-minutes": "10080",
      "x-codex-secondary-used-percent": "3",
      "x-codex-secondary-window-minutes": "10080",
    });
    expect(data?.usedPercent).toBe(2);
  });

  test("out-of-range or non-finite percents are rejected", () => {
    expect(
      parseQuotaHeaders({ "x-codex-primary-used-percent": "150", "x-codex-primary-window-minutes": "10080" }),
    ).toBeNull();
    expect(
      parseQuotaHeaders({ "x-codex-primary-used-percent": "-5", "x-codex-primary-window-minutes": "10080" }),
    ).toBeNull();
    expect(
      parseQuotaHeaders({ "x-codex-primary-used-percent": "abc", "x-codex-primary-window-minutes": "10080" }),
    ).toBeNull();
  });

  test("non-weekly windows are rejected", () => {
    expect(
      parseQuotaHeaders({ "x-codex-primary-used-percent": "1", "x-codex-primary-window-minutes": "60" }),
    ).toBeNull();
  });

  test("missing reset is allowed", () => {
    const data = parseQuotaHeaders({
      "x-codex-primary-used-percent": weekly.used,
      "x-codex-primary-window-minutes": weekly.window,
    });
    expect(data?.resetAt).toBeNull();
  });

  test("empty headers", () => {
    expect(parseQuotaHeaders({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

describe("parseUsagePayload", () => {
  const window = { used_percent: 1.5, limit_window_seconds: 604800, reset_at: 1750000000 };

  test("nested rate_limit shape", () => {
    const data = parseUsagePayload({
      rate_limit: { primary_window: window, secondary_window: { ...window, used_percent: 99 } },
    });
    expect(data).toEqual({ usedPercent: 1.5, windowMinutes: 10080, resetAt: 1750000000 });
  });

  test("weekly in secondary only", () => {
    const data = parseUsagePayload({
      rate_limit: {
        primary_window: { used_percent: 10, limit_window_seconds: 18000 }, // 5h
        secondary_window: window,
      },
    });
    expect(data?.usedPercent).toBe(1.5);
  });

  test("top-level fallback", () => {
    const data = parseUsagePayload({ used_percent: 1.5, limit_window_seconds: 604800, reset_at: 1750000000 });
    expect(data?.usedPercent).toBe(1.5);
  });

  test("incompatible payloads return null, never throw", () => {
    expect(parseUsagePayload(null)).toBeNull();
    expect(parseUsagePayload("nope")).toBeNull();
    expect(parseUsagePayload({})).toBeNull();
    expect(parseUsagePayload({ rate_limit: {} })).toBeNull();
    expect(parseUsagePayload({ rate_limit: { primary_window: { used_percent: 1.5 } } })).toBeNull();
    expect(parseUsagePayload({ rate_limit: { primary_window: { used_percent: 1.5, limit_window_seconds: 60 } } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// JWT + auth
// ---------------------------------------------------------------------------

function makeToken(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${b64}.signature`;
}

describe("JWT helpers", () => {
  test("decodes base64url payload", () => {
    const payload = decodeJwtPayload(makeToken({ sub: "u1" }));
    expect(payload?.sub).toBe("u1");
  });

  test("malformed tokens return null", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull(); // invalid base64/json
    expect(decodeJwtPayload("")).toBeNull();
  });

  test("account id from nested claim", () => {
    const token = makeToken({ "https://api.openai.com/auth": { chatgpt_account_id: "acc-123" } });
    expect(extractChatgptAccountId(token)).toBe("acc-123");
  });

  test("account id from flat and top-level claims", () => {
    expect(extractChatgptAccountId(makeToken({ "https://api.openai.com/auth.chatgpt_account_id": "acc-flat" }))).toBe(
      "acc-flat",
    );
    expect(extractChatgptAccountId(makeToken({ chatgpt_account_id: "acc-top" }))).toBe("acc-top");
    expect(extractChatgptAccountId(makeToken({}))).toBeUndefined();
    expect(extractChatgptAccountId("junk")).toBeUndefined();
  });

  test("extractAccessToken handles bearer and apiKey", () => {
    expect(extractAccessToken({ headers: { authorization: "Bearer tok123" } })).toBe("tok123");
    expect(extractAccessToken({ headers: { Authorization: "bearer tok123" } })).toBe("tok123");
    expect(extractAccessToken({ apiKey: "k-abc" })).toBe("k-abc");
    expect(extractAccessToken({})).toBeNull();
    expect(extractAccessToken({ headers: { authorization: "Bearer   " } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// URL mapping + fetch
// ---------------------------------------------------------------------------

describe("buildUsageUrl", () => {
  test("backend-api base -> /wham/usage", () => {
    expect(buildUsageUrl("https://chatgpt.com/backend-api")).toBe(
      "https://chatgpt.com/backend-api/wham/usage",
    );
  });

  test("codex base -> /api/codex/usage", () => {
    expect(buildUsageUrl("https://chatgpt.com/codex")).toBe("https://chatgpt.com/codex/api/codex/usage");
    expect(buildUsageUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1/api/codex/usage");
  });

  test("missing base", () => {
    expect(buildUsageUrl(undefined)).toBeNull();
  });
});

describe("fetchQuota (best-effort)", () => {
  const baseUrl = "https://chatgpt.com/backend-api";
  const usageUrl = `${baseUrl}/wham/usage`;
  const payload = { rate_limit: { primary_window: { used_percent: 1.5, limit_window_seconds: 604800, reset_at: 1750000000 } } };

  function response(status: number, url: string, body: string): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      url,
      text: async () => body,
    } as unknown as Response;
  }

  test("200 populates quota", async () => {
    const data = await fetchQuota({
      token: "tok",
      baseUrl,
      fetchFn: async () => response(200, usageUrl, JSON.stringify(payload)),
    });
    expect(data?.usedPercent).toBe(1.5);
    expect(data?.resetAt).toBe(1750000000);
  });

  test("auth and client errors return null", async () => {
    for (const status of [401, 403, 404, 429]) {
      const data = await fetchQuota({
        token: "tok",
        baseUrl,
        fetchFn: async () => response(status, usageUrl, "{}"),
      });
      expect(data).toBeNull();
    }
  });

  test("redirect to unexpected host is rejected", async () => {
    const data = await fetchQuota({
      token: "tok",
      baseUrl,
      fetchFn: async () => response(200, "https://evil.example.com/usage", JSON.stringify(payload)),
    });
    expect(data).toBeNull();
  });

  test("redirects are never followed automatically", async () => {
    let redirect: RequestRedirect | undefined;
    await fetchQuota({
      token: "tok",
      baseUrl,
      fetchFn: async (_input, init) => {
        redirect = init?.redirect;
        return response(302, usageUrl, "");
      },
    });
    expect(redirect).toBe("manual");
  });

  test("invalid JSON returns null", async () => {
    const data = await fetchQuota({
      token: "tok",
      baseUrl,
      fetchFn: async () => response(200, usageUrl, "not json"),
    });
    expect(data).toBeNull();
  });

  test("oversized body returns null", async () => {
    const data = await fetchQuota({
      token: "tok",
      baseUrl,
      fetchFn: async () => response(200, usageUrl, "x".repeat(1_000_001)),
    });
    expect(data).toBeNull();
  });

  test("timeout returns null", async () => {
    const data = await fetchQuota({
      token: "tok",
      baseUrl,
      timeoutMs: 5,
      fetchFn: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    expect(data).toBeNull();
  });

  test("missing base returns null without fetching", async () => {
    const data = await fetchQuota({ token: "tok" });
    expect(data).toBeNull();
  });

  test("sends expected headers", async () => {
    let seen: RequestInit | undefined;
    await fetchQuota({
      token: "tok-1",
      accountId: "acc-1",
      baseUrl,
      fetchFn: async (_input, init) => {
        seen = init;
        return response(200, usageUrl, "{}");
      },
    });
    const headers = seen?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok-1");
    expect(headers.accept).toBe("application/json");
    expect(headers["chatgpt-account-id"]).toBe("acc-1");
  });
});
