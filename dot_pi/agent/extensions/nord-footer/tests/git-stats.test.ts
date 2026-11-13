/**
 * Tests for git-stats.ts — numstat parsing and async Git helpers.
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import {
  isNotARepoError,
  normalizeRepoRoot,
  repoNameFromRoot,
  resolveRepoRoot,
  type ExecFn,
} from "../git-stats.ts";

describe("normalizeRepoRoot", () => {
  test("converts MSYS paths to Windows drive paths", () => {
    expect(normalizeRepoRoot("/e/msys64/home/Sphynx/proj")).toBe("e:/msys64/home/Sphynx/proj");
    expect(normalizeRepoRoot("/C/Users/me/proj")).toBe("C:/Users/me/proj");
  });

  test("leaves Windows and POSIX roots untouched", () => {
    expect(normalizeRepoRoot("C:/proj/Trinity")).toBe("C:/proj/Trinity");
    expect(normalizeRepoRoot("C:\\proj\\Trinity")).toBe("C:/proj/Trinity");
    expect(normalizeRepoRoot("/home/user/proj")).toBe("/home/user/proj");
  });
});

describe("repoNameFromRoot", () => {
  test("windows and posix roots", () => {
    expect(repoNameFromRoot("C:/proj/Trinity")).toBe("Trinity");
    expect(repoNameFromRoot("C:\\proj\\Trinity")).toBe("Trinity");
    expect(repoNameFromRoot("/home/user/proj/")).toBe("proj");
    expect(repoNameFromRoot("/")).toBe("");
  });

  test("sanitizes control characters", () => {
    expect(repoNameFromRoot("C:/proj/my\nrepo")).toBe("my repo");
  });
});

describe("error classification", () => {
  test("not-a-repo detection", () => {
    expect(isNotARepoError("fatal: not a git repository (or any of the parent directories): .git")).toBe(true);
    expect(isNotARepoError("fatal: unknown revision 'HEAD'")).toBe(false);
  });

});

describe("resolveRepoRoot", () => {
  const exec: ExecFn = async (_cmd, _args, _opts) => ({ stdout: "", stderr: "", code: 0 });

  test("success returns normalized root", async () => {
    const result = await resolveRepoRoot(
      async () => ({ stdout: "C:\\proj\\Trinity\n", stderr: "", code: 0 }),
      "C:/proj/Trinity/sub",
    );
    expect(result).toEqual({ kind: "repo", root: "C:/proj/Trinity" });
  });

  test("not-a-repo is classified separately", async () => {
    const result = await resolveRepoRoot(
      async () => ({ stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git", code: 128 }),
      "/tmp/empty",
    );
    expect(result).toEqual({ kind: "not-repo" });
  });

  test("other failures are errors", async () => {
    const result = await resolveRepoRoot(
      async () => ({ stdout: "", stderr: "git: command not found", code: 127 }),
      "/tmp/empty",
    );
    expect(result).toEqual({ kind: "error" });
  });

  test("empty stdout is an error", async () => {
    const result = await resolveRepoRoot(exec, "/tmp");
    expect(result).toEqual({ kind: "error" });
  });

  test("passes cwd, signal and timeout", async () => {
    const opts: { cwd?: string; signal?: AbortSignal; timeout?: number }[] = [];
    await resolveRepoRoot(async (_c, _a, o) => {
      opts.push(o ?? {});
      return { stdout: "/repo\n", stderr: "", code: 0 };
    }, "/start", { signal: undefined, timeout: 3000 });
    expect(opts[0].cwd).toBe("/start");
    expect(opts[0].timeout).toBe(3000);
  });
});
