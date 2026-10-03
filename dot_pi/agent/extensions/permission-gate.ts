import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { lstatSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export default function (pi: ExtensionAPI) {
  function allowedScratchCleanup(command: string) {
    // Only a complete, simple command: no shell evaluation or variable tracing.
    if (/[\r\n]/.test(command)) return false;
    const match = command.trim().match(
      /^rm[ \t]+(?:-(?:r|R|rf|fr|Rf|fR)|--recursive)[ \t]+(?:--[ \t]+)?(.+)$/,
    );
    if (!match) return false;
    const root = resolve(homedir(), ".pi/agent/tmp");
    const token = /("[^"]*"|'[^']*'|[^ \t"']+)(?:[ \t]+|$)/gy;
    let offset = 0;
    while (offset < match[1].length) {
      const part = token.exec(match[1]);
      if (!part) return false;
      offset = token.lastIndex;
      const quoted = part[1].startsWith('"') || part[1].startsWith("'");
      let path = quoted ? part[1].slice(1, -1) : part[1];
      if (!part[1].startsWith("'") && /^\$(?:HOME|\{HOME\})(?=\/)/.test(path)) {
        if (!process.env.HOME || resolve(process.env.HOME) !== homedir()) return false;
        path = path.replace(/^\$(?:HOME|\{HOME\})(?=\/)/, homedir());
      }
      // Reject shell syntax, control characters, globs and unresolved variables.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: reject control characters at the shell boundary
      if (/[$`\\;&|<>(){}*?![\]"'\x00-\x1f\x7f]/.test(path)) return false;
      if (!isAbsolute(path) || path.split("/").some(p => p === "." || p === "..")) return false;
      const child = relative(root, resolve(path));
      if (!child || child === ".." || child.startsWith("../") || isAbsolute(child)) return false;
      try {
        if (!lstatSync(root).isDirectory()) return false;
        let current = root;
        for (const component of child.split("/")) {
          current = resolve(current, component);
          try {
            if (lstatSync(current).isSymbolicLink()) return false;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
          }
        }
      } catch {
        return false;
      }
    }
    return true;
  }
  const dangerousCommands = [
    /\brm\s+(-[^\s]*r[^\s]*|--recursive)\b/i,
    /\bsudo\b/i,
    /\b(chmod|chown)\b[^\n]*\b777\b/i,
    /\b(cat|head|tail|less|more|sed|awk|grep|strings|base64|xxd)\b[^\n]*(?:~[\\/]\.ssh|[\\/]\.ssh(?:[\\/\s]|$)|(?:^|[\\s"'=:\\/:])\.env(?:[.\\w\\/\\-]|$))/i,
  ];

  function normalized(path: string) {
    const value = normalize(path).replaceAll("\\", "/");
    return process.platform === "win32" ? value.toLowerCase() : value;
  }

  function isProtectedPath(inputPath: string, cwd: string) {
    const expanded = inputPath === "~" || inputPath.startsWith("~/") || inputPath.startsWith("~\\")
      ? resolve(homedir(), inputPath.slice(2))
      : isAbsolute(inputPath)
        ? normalize(inputPath)
        : resolve(cwd, inputPath);

    const target = normalized(expanded);
    const projectEnv = normalized(resolve(cwd, ".env"));
    const projectRelative = relative(normalized(cwd), target).replaceAll("\\", "/");
    const sshDir = normalized(resolve(homedir(), ".ssh"));
    const sshRelative = relative(sshDir, target).replaceAll("\\", "/");

    return target === projectEnv
      || (projectRelative.startsWith(".env.") && !projectRelative.includes("/"))
      || (target === sshDir || sshRelative.length > 0 && !isAbsolute(sshRelative) && !sshRelative.startsWith("../") && sshRelative !== "..");
  }

  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("bash", event)) {
      const command = event.input.command;
      const commandToCheck = allowedScratchCleanup(command) ? "" : command;
      if (dangerousCommands.some((pattern) => pattern.test(commandToCheck))) {
        return { block: true, reason: "Comando Bash bloccato dalla permission policy" };
      }
    }

    if (
      isToolCallEventType("read", event) ||
      isToolCallEventType("grep", event) ||
      isToolCallEventType("find", event)
    ) {
      const inputPath = event.input.path;
      if (inputPath && isProtectedPath(inputPath, ctx.cwd)) {
        return { block: true, reason: "Lettura del percorso bloccata dalla permission policy" };
      }
    }
  });
}
