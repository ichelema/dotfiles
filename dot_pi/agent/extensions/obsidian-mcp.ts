import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { TSchema } from "typebox";
import { addAbortListener } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OBSIDIAN_MCP_URL = "http://localhost:3002/mcp";
const MCP_PROTOCOL_VERSION = "2025-06-18";

type JsonRpcResponse = {
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: TSchema;
};

function parseResponse(body: string): JsonRpcResponse | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }

  // Streamable HTTP may return a finite Server-Sent Events response.
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    try {
      return JSON.parse(data) as JsonRpcResponse;
    } catch {
      // Ignore non-JSON SSE data and continue looking for the JSON-RPC message.
    }
  }

  throw new Error("Risposta MCP non riconosciuta");
}

export class ObsidianMcpClient {
  private sessionId: string | undefined;
  private initialized = false;
  private initializePromise: Promise<void> | undefined;

  constructor(private readonly url: string) {}

  reset() {
    this.sessionId = undefined;
    this.initialized = false;
    this.initializePromise = undefined;
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    await this.ensureInitialized(signal);
    const response = await this.request("tools/list", {}, signal);
    return Array.isArray(response?.result?.tools) ? response.result.tools : [];
  }

  async callTool(name: string, arguments_: unknown, signal?: AbortSignal) {
    await this.ensureInitialized(signal);
    const response = await this.request("tools/call", { name, arguments: arguments_ }, signal);
    return response?.result ?? {};
  }

  private async ensureInitialized(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.initialized) return;
    if (!this.initializePromise) {
      this.initializePromise = this.initialize().finally(() => {
        this.initializePromise = undefined;
      });
    }
    if (!signal) return this.initializePromise;
    const cancelled = Promise.withResolvers<never>();
    const listener = addAbortListener(signal, () => cancelled.reject(signal.reason));
    try {
      await Promise.race([this.initializePromise, cancelled.promise]);
    } finally {
      listener[Symbol.dispose]();
    }
  }

  private async initialize() {
    // A failed handshake may have left a session ID behind.
    this.sessionId = undefined;
    const response = await this.request(
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "pi-obsidian-extension", version: "0.1.0" },
      },
      undefined,
      false,
    );

    if (!this.sessionId) {
      throw new Error("Il server MCP non ha restituito Mcp-Session-Id");
    }

    await this.request("notifications/initialized", undefined);
    if (!response?.result) throw new Error("Risposta initialize MCP vuota");
    this.initialized = true;
  }

  private async request(
    method: string,
    params: unknown,
    signal?: AbortSignal,
    requiresSession = true,
    retryExpiredSession = true,
  ): Promise<JsonRpcResponse | undefined> {
    if (requiresSession && !this.sessionId) {
      throw new Error("Sessione MCP non inizializzata");
    }

    const requestSessionId = this.sessionId;
    const timeout = AbortSignal.timeout(10_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(requestSessionId ? { "Mcp-Session-Id": requestSessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: method.startsWith("notifications/") ? undefined : Date.now(),
        method,
        ...(params === undefined ? {} : { params }),
      }),
      signal: requestSignal,
    });

    const body = await response.text();
    if (!response.ok) {
      if (
        response.status === 404 &&
        requestSessionId &&
        (method === "tools/list" || method === "tools/call")
      ) {
        let error: JsonRpcResponse["error"];
        try {
          error = parseResponse(body)?.error;
        } catch {
          // A generic HTTP 404 is not proof that a tool was never executed.
        }
        if (
          error?.code === -32001 &&
          error.message ===
            "Session expired or not found. Start a new session by sending an initialize request without a session ID." &&
          error.data && typeof error.data === "object" &&
          "sessionId" in error.data && error.data.sessionId === requestSessionId
        ) {
          // A concurrent call may already be establishing a replacement session.
          if (this.sessionId === requestSessionId) this.reset();
          if (retryExpiredSession) {
            signal?.throwIfAborted();
            await this.ensureInitialized(signal);
            return this.request(method, params, signal, requiresSession, false);
          }
        }
      }
      throw new Error(`MCP HTTP ${response.status}: ${body || response.statusText}`);
    }

    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId && this.sessionId === requestSessionId) this.sessionId = sessionId;

    const message = parseResponse(body);
    if (message?.error) {
      throw new Error(`MCP ${message.error.code}: ${message.error.message}`);
    }
    return message;
  }
}

function toolNameForPi(name: string): string {
  return `obsidian_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function resultToText(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content
      .map((item: any) => {
        if (item?.type === "text" && typeof item.text === "string") return item.text;
        if (item?.type === "image") return `[Immagine MCP: ${item.mimeType ?? "tipo sconosciuto"}]`;
        return JSON.stringify(item, null, 2);
      })
      .join("\n");
  }

  if (result?.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  return JSON.stringify(result, null, 2) ?? String(result);
}

async function truncateResult(text: string) {
  const truncation = truncateHead(text);
  if (!truncation.truncated) return { text: truncation.content, truncated: false };

  const directory = await mkdtemp(join(tmpdir(), "pi-obsidian-"));
  const fullPath = join(directory, "result.txt");
  await writeFile(fullPath, text, "utf8");

  return {
    text: `${truncation.content}\n\n[Output troncato. Risultato completo salvato in: ${fullPath}]`,
    truncated: true,
  };
}

export default function obsidianMcpExtension(pi: ExtensionAPI) {
  const client = new ObsidianMcpClient(OBSIDIAN_MCP_URL);
  const registeredNames = new Set<string>();
  let loadPromise: Promise<void> | undefined;

  const loadTools = (ctx: ExtensionContext) => {
    if (!loadPromise) {
      loadPromise = (async () => {
        const tools = await client.listTools(ctx.signal);
        for (const tool of tools) {
          if (!tool.name || registeredNames.has(toolNameForPi(tool.name))) continue;

          const piName = toolNameForPi(tool.name);
          registeredNames.add(piName);
          pi.registerTool({
            name: piName,
            label: `Obsidian ${tool.name}`,
            description: tool.description ?? `Invoca lo strumento MCP Obsidian ${tool.name}`,
            parameters: tool.inputSchema ?? Type.Object({}),
            async execute(_toolCallId, params, signal) {
              const result = await client.callTool(tool.name, params, signal);
              const text = resultToText(result);
              if (result?.isError) throw new Error(text);
              const output = await truncateResult(text);
              return {
                content: [{ type: "text", text: output.text }],
                details: { mcpTool: tool.name, truncated: output.truncated },
              };
            },
          });
        }
        ctx.ui.notify(`Obsidian MCP: ${tools.length} strumenti disponibili`, "info");
      })().finally(() => {
        loadPromise = undefined;
      });
    }
    return loadPromise;
  };

  pi.on("session_start", async (_event, ctx) => {
    client.reset();
    try {
      await loadTools(ctx);
    } catch (error) {
      ctx.ui.notify(`Obsidian MCP non disponibile: ${String(error)}`, "warning");
    }
  });
}
