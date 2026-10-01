/**
 * Tests for git-stats.ts — numstat parsing and async Git helpers.
 * Run with: bun test
 */
import { describe, expect, test } from "bun:test";
import {
  getGitDiff,
  isBadHeadError,
  isNotARepoError,
  normalizeRepoRoot,
  parseNumstat,
  repoNameFromRoot,
  resolveRepoRoot,
  type ExecFn,
} from "../git-stats.ts";

describe("parseNumstat", () => {
  test("sums numeric columns, ignores binary and malformed lines", () => {
    const totals = parseNumstat([
      "12\t3\tsrc/a.ts",
      "5\t0\tother.ts",
      "-\t-\tbin/image.png",
      "garbage",
      "\t1\tbroken.ts",
      "",
    ].join("\n"));
    expect(totals).toEqual({ additions: 17, deletions: 3 });
  });

  test("renames contribute 0/0", () => {
    expect(parseNumstat("0\t0\tsrc/old.ts => src/new.ts")).toEqual({ additions: 0, deletions: 0 });
  });

  test("empty output", () => {
    expect(parseNumstat("")).toEqual({ additions: 0, deletions: 0 });
    expect(parseNumstat("  \n\n")).toEqual({ additions: 0, deletions: 0 });
  });

  test("windows line endings", () => {
    expect(parseNumstat("2\t1\tfile.ts\r\n3\t1\tfile2.ts\r\n")).toEqual({ additions: 5, deletions: 2 });
  });
});

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

  test("bad HEAD detection", () => {
    expect(isBadHeadError("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.")).toBe(true);
    expect(isBadHeadError("fatal: bad revision 'HEAD'")).toBe(true);
    expect(isBadHeadError("fatal: this operation must be run in a work tree")).toBe(false);
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

describe("getGitDiff", () => {
  test("ok result parses numstat", async () => {
    const result = await getGitDiff(
      async () => ({ stdout: "4\t2\tf.ts\n", stderr: "", code: 0 }),
      "/repo",
    );
    expect(result).toEqual({ kind: "ok", totals: { additions: 4, deletions: 2 } });
  });

  test("missing HEAD is classified", async () => {
    const result = await getGitDiff(
      async () => ({ stdout: "", stderr: "fatal: ambiguous argument 'HEAD': unknown revision", code: 128 }),
      "/repo",
    );
    expect(result).toEqual({ kind: "no-head" });
  });

  test("other failures are errors", async () => {
    const result = await getGitDiff(
      async () => ({ stdout: "", stderr: "boom", code: 1 }),
      "/repo",
    );
    expect(result).toEqual({ kind: "error" });
  });

  test("runs against the repo root", async () => {
    let cwd = "";
    await getGitDiff(
      async (_c, _a, o) => {
        cwd = o?.cwd ?? "";
        return { stdout: "", stderr: "", code: 0 };
      },
      "/repo/root",
    );
    expect(cwd).toBe("/repo/root");
  });
});
