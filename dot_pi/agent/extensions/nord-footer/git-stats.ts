/**
 * git-stats.ts — async Git access for the footer.
 *
 * Pure parsers plus small async helpers over an injected exec function so the
 * module stays unit-testable without spawning real processes.
 */
import { sanitizeLine } from "./footer-format.ts";

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
