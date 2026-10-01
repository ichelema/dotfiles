/**
 * nord-footer — global PI extension: reactive Nord footer.
 *
 * Replaces the built-in footer in TUI mode with:
 *   model | effort | project@branch (+A -D) | ctx/max (%) | cache R↓/W↑ (%) | quota | cost
 *
 * All async work (Git, usage endpoint) happens in the background with TTL,
 * negative-cache and single-flight guards; render() stays synchronous.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { FooterState, type FooterServices } from "./footer-state.ts";

const FILE_CHANGING_TOOLS = new Set(["write", "edit", "bash"]);

function getAdvisorModel(cwd: string): string | undefined {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  for (const path of [join(cwd, ".pi", "modes.json"), join(agentDir, "modes.json")]) {
    try {
      const advisor = JSON.parse(readFileSync(path, "utf8")).modes?.advisor;
      if (typeof advisor?.provider === "string" && typeof advisor?.modelId === "string") {
        return `${advisor.provider}/${advisor.modelId}`;
      }
    } catch {}
  }
}

export default function (pi: ExtensionAPI) {
  // Active session's footer state; null when no TUI session is live.
  let state: FooterState | null = null;

  function makeServices(ctx: ExtensionContext): FooterServices {
    return {
      cwd: ctx.cwd,
      exec: (command, args, options) => pi.exec(command, args, options),
      modelProvider: () => ctx.model?.provider,
      modelId: () => ctx.model?.id,
      modelBaseUrl: () => ctx.model?.baseUrl,
      thinkingLevel: () => ctx.thinkingLevel,
      contextWindow: () => ctx.model?.contextWindow,
      getContextUsage: () => ctx.getContextUsage(),
      getEntries: () => ctx.sessionManager.getEntries(),
      getLeafId: () => ctx.sessionManager.getLeafId(),
      getAuth: (provider) => ctx.modelRegistry.getProviderAuth(provider),
    };
  }

  // -- session lifecycle ----------------------------------------------------

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    state?.dispose();
    state = new FooterState(makeServices(ctx));
    const advisorModel = getAdvisorModel(ctx.cwd);

    ctx.ui.setFooter((tui, theme, footerData) => {
      state?.setRequestRender(() => tui.requestRender());
      state?.updateBranch(footerData.getGitBranch());
      const unsubscribe = footerData.onBranchChange(() => {
        state?.updateBranch(footerData.getGitBranch());
      });

      return {
        invalidate() {
          state?.invalidate();
        },
        render(width: number): string[] {
          const statuses = footerData.getExtensionStatuses();
          const advisor = statuses.get("q-advisor");
          const extensions = [
            statuses.get("ponytail"),
            advisorModel
              ? advisor?.replace(
                  /Advisor: (\$.*)$/,
                  (_match, cost) => `Advisor:${theme.fg("muted", ` ${advisorModel} ${cost}`)}`,
                )
              : advisor,
          ]
            .filter(Boolean)
            .join(" ");
          if (!extensions) return [state ? state.render(width, theme) : ""];

          const prefix = `${extensions}${theme.fg("dim", " | ")}`;
          const remaining = width - visibleWidth(prefix);
          return remaining > 0
            ? [prefix + (state ? state.render(remaining, theme) : "")]
            : [truncateToWidth(extensions, width, "…")];
        },
        dispose() {
          unsubscribe();
          state?.dispose();
        },
      };
    });

    state?.bootstrap();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    state?.dispose();
    state = null;
    try {
      ctx.ui.setFooter(undefined);
    } catch {
      // Context may already be torn down during shutdown.
    }
  });

  // -- model / thinking -----------------------------------------------------

  pi.on("model_select", (event, _ctx) => {
    state?.updateModel(event.model.provider, event.model.id);
  });

  pi.on("thinking_level_select", (event, _ctx) => {
    state?.updateEffort(event.level);
  });

  // -- usage / context changes ----------------------------------------------

  pi.on("turn_end", () => {
    state?.onSessionDataChanged();
  });

  pi.on("session_compact", () => {
    state?.onSessionDataChanged();
  });

  pi.on("session_tree", () => {
    state?.onSessionDataChanged();
  });

  // -- Git staleness --------------------------------------------------------

  pi.on("tool_execution_end", (event) => {
    if (FILE_CHANGING_TOOLS.has(event.toolName)) {
      state?.markGitStale();
    }
  });

  // -- Codex quota from response headers ------------------------------------

  pi.on("after_provider_response", (event, ctx) => {
    if (ctx.model?.provider !== "openai-codex") return;
    state?.handleQuotaHeaders(event.headers);
  });
}
