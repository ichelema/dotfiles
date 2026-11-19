import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Un prompt template espanso arriva come messaggio utente di migliaia di righe. pi-sync mette
// come prima riga `<!-- pi:cmd /comando args -->`: qui il messaggio mostrato diventa `▸ /comando args`.
// Si cambia `text` del componente prima di rebuild(): vale sia per il render di pi sia per quello
// compatto di pi-tool-renderer (che rilegge `text`). Il contesto del modello non cambia.
const MARKER = /^<!-- pi:cmd (.+?) -->/;
const PATCHED: unique symbol = Symbol.for("ichelema.collapse-command");

export function collapse(text: unknown): unknown {
	if (typeof text !== "string") return text;
	const match = MARKER.exec(text);
	return match ? `▸ ${match[1].trim()}` : text;
}

export default async function (pi: ExtensionAPI) {
	const { UserMessageComponent } = await import(
		"@earendil-works/pi-coding-agent"
	);
	const proto = UserMessageComponent.prototype as unknown as {
		rebuild: (this: unknown) => void;
		[PATCHED]?: () => void;
	};
	if (proto[PATCHED]) return;
	const original = proto.rebuild;
	proto[PATCHED] = original;
	proto.rebuild = function (this: { text: unknown }) {
		this.text = collapse(this.text);
		return original.call(this);
	};
	pi.on("session_shutdown", () => {
		if (proto[PATCHED] !== original) return;
		proto.rebuild = original;
		delete proto[PATCHED];
	});
}
