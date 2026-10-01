import {
  isToolCallEventType,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export default function (pi: ExtensionAPI) {
  const allowedScratchCleanup =
    /\brm\s+-rf\s+--\s+(?:"\$HOME\/\.pi\/agent\/tmp"|\$HOME\/\.pi\/agent\/tmp)(?=['\s;&|]|$)/gi;
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
      const commandToCheck = command.replace(allowedScratchCleanup, "");
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
