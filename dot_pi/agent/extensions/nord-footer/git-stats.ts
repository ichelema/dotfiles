/**
 * git-stats.ts — async Git access for the footer.
 *
 * Pure parsers plus small async helpers over an injected exec function so the
 * module stays unit-testable without spawning real processes.
 */
import { sanitizeLine } from "./footer-format.ts";

export interface NumstatTotals {
  additions: number;
  deletions: number;
}

export interface ExecResultLike {
  stdout: string;
  stderr: string;
  code: number;
}

export type ExecFn = (
  command: string,
  args: string[],
  options?: { signal?: AbortSignal; timeout?: number; cwd?: string },
) => Promise<ExecResultLike>;

/**
 * Sum the first two numeric columns of `git diff --numstat HEAD --` output.
 * Binary files (`-\t-`) and malformed lines are ignored.
 */
export function parseNumstat(output: string): NumstatTotals {
  let additions = 0;
  let deletions = 0;
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [added, deleted, ...rest] = line.split("\t");
    if (rest.length < 1) continue; // no filename column -> malformed
    if (!added.trim() || !deleted.trim()) continue; // missing numeric column
    const a = Number(added);
    const d = Number(deleted);
    if (!Number.isFinite(a) || !Number.isFinite(d)) continue; // binary "-"
    additions += a;
    deletions += d;
  }
  return { additions, deletions };
}

/** Basename of a repository root, robust to Windows/MSYS2 separators. */
export function repoNameFromRoot(root: string): string {
  const normalized = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  const last = parts[parts.length - 1] ?? "";
  return sanitizeLine(last) || sanitizeLine(normalized);
}

/**
 * Convert an MSYS-style root (/e/proj) to a Windows path (E:/proj) so it can
 * be used as a process cwd. Windows-native git output (C:/proj) is untouched.
 */
export function normalizeRepoRoot(root: string): string {
  const normalized = root.replace(/\\/g, "/");
  return normalized.replace(/^\/([a-zA-Z])\//, "$1:/");
}

export function isNotARepoError(stderr: string): boolean {
  return /not a git repository/i.test(stderr);
}

/** Error strings git emits when HEAD does not exist yet (no commits). */
export function isBadHeadError(stderr: string): boolean {
  return /(unknown revision|bad revision|ambiguous argument|HEAD\b.*does not exist|not a git repository)/i.test(
    stderr,
  );
}

export type ResolveRepoResult =
  | { kind: "repo"; root: string }
  | { kind: "not-repo" }
  | { kind: "error" };

/** Resolve the repository root once via `git rev-parse --show-toplevel`. */
export async function resolveRepoRoot(
  exec: ExecFn,
  cwd: string,
  options?: { signal?: AbortSignal; timeout?: number },
): Promise<ResolveRepoResult> {
  const res = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, ...options });
  if (res.code !== 0) {
    return isNotARepoError(res.stderr) ? { kind: "not-repo" } : { kind: "error" };
  }
  const root = normalizeRepoRoot(res.stdout.trim());
  return root ? { kind: "repo", root } : { kind: "error" };
}

export type DiffResult =
  | { kind: "ok"; totals: NumstatTotals }
  | { kind: "no-head" }
  | { kind: "error" };

/** Working-tree diff vs HEAD (staged + unstaged tracked files). Runs in `cwd`. */
export async function getGitDiff(
  exec: ExecFn,
  cwd: string,
  options?: { signal?: AbortSignal; timeout?: number },
): Promise<DiffResult> {
  const res = await exec("git", ["diff", "--numstat", "HEAD", "--"], { cwd, ...options });
  if (res.code !== 0) {
    return isBadHeadError(res.stderr) ? { kind: "no-head" } : { kind: "error" };
  }
  return { kind: "ok", totals: parseNumstat(res.stdout) };
}
