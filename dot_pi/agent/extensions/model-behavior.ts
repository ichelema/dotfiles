import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	type ExtensionAPI,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";

const files: Record<string, string> = {
	"gpt-6-astra": "AGENTS_Astra.md",
	"gpt-5.6": "AGENTS_Sol.md",
	"gpt-5.6-sol": "AGENTS_Sol.md",
};

function stripModelBehavior(prompt: string) {
	// Only remove blocks explicitly owned by this extension.
	return prompt.replace(
		/\n\n<model_behavior source="model-behavior">\r?\n[\s\S]*?\r?\n<\/model_behavior>/g,
		"",
	);
}

function setCommon(prompt: string, path: string, content?: string) {
	const replacement = content
		? `<project_instructions path="${path}">\n${content}\n</project_instructions>`
		: "";
	let found = false;
	const result = prompt.replace(
		/<project_instructions path="([^"]+)">\r?\n[\s\S]*?\r?\n<\/project_instructions>/g,
		(block, candidate: string) => {
			if (resolve(candidate) !== resolve(path)) return block;
			if (found) return "";
			found = true;
			return replacement;
		},
	);
	return !found && replacement ? `${result}\n\n${replacement}` : result;
}

export async function buildModelPrompt(
	systemPrompt: string,
	modelId: string,
	agentDir: string,
	customPrompt?: string,
) {
	const commonPath = join(agentDir, "AGENTS.md");
	const common = (await readFile(commonPath, "utf8")).trim();
	if (!common) throw new Error(`File comune vuoto: ${commonPath}`);
	// Refresh inherited globals too: they may still contain old orchestration.
	const prompt = setCommon(
		stripModelBehavior(systemPrompt),
		commonPath,
		common,
	);

	// pi-subagents 0.19 emits this standalone tag in both append and replace.
	// ponytail: package convention, update this check if its prompt format changes.
	const child = /^<active_agent name="[^"\r\n]+"\/>\r?$/m.test(
		customPrompt ?? systemPrompt,
	);
	if (child) return prompt;

	const filename = Object.hasOwn(files, modelId) ? files[modelId] : undefined;
	if (!filename) return prompt;
	const supplementPath = join(agentDir, filename);
	try {
		const content = (await readFile(supplementPath, "utf8")).trim();
		return content
			? `${prompt}\n\n<model_behavior source="model-behavior">\n${content}\n</model_behavior>`
			: prompt;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return prompt;
		throw new Error(`Impossibile leggere ${supplementPath}`, { cause: error });
	}
}

export default function modelBehavior(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const systemPrompt = await buildModelPrompt(
				event.systemPrompt,
				ctx.model?.id ?? "",
				getAgentDir(),
				event.systemPromptOptions.customPrompt,
			);
			return { systemPrompt };
		} catch (error) {
			let fallback = stripModelBehavior(event.systemPrompt);
			let message = error instanceof Error ? error.message : String(error);
			try {
				// A broken optional supplement must not discard readable common rules.
				fallback = await buildModelPrompt(fallback, "", getAgentDir());
			} catch {
				fallback = setCommon(fallback, join(getAgentDir(), "AGENTS.md"));
				message = `AGENTS.md non disponibile; regole comuni non caricate. ${message}`;
				fallback +=
					"\n\nRegole comuni non disponibili: segnala il problema e non eseguire azioni finché AGENTS.md non è ripristinato.";
			}
			if (ctx.hasUI) ctx.ui.notify(message, "error");
			else console.error(message);
			return { systemPrompt: fallback };
		}
	});
}
