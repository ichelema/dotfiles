import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Il pacchetto di pi non è risolvibile da qui: lo si carica dall'installazione corrente
// (versione in install/current-version) tramite l'entry pubblica, e lo si espone al modulo.
const install = join(homedir(), ".pi/agent/install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const pkg = join(
	install,
	"releases",
	version,
	"node_modules/@earendil-works/pi-coding-agent",
);
const { UserMessageComponent, initTheme } = await import(
	join(pkg, "dist/index.js")
);
mock.module("@earendil-works/pi-coding-agent", () => ({
	UserMessageComponent,
}));
const { default: collapseCommand, collapse } = await import(
	"../collapse-command"
);

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m|${ESC}\\]133;[A-C]${BEL}`, "g");
const strip = (lines: string[]) => lines.join("\n").replace(ANSI, "");
type Proto = { rebuild: unknown };
const proto = (): Proto => UserMessageComponent.prototype as Proto;

test("collapse: marcatore → comando, altro invariato", () => {
	expect(
		collapse("<!-- pi:cmd /2_work-issue ICH-523 sol -->\n\nCorpo lungo"),
	).toBe("▸ /2_work-issue ICH-523 sol");
	expect(collapse("<!-- pi:cmd /5_remove-worktree  -->\n\nx")).toBe(
		"▸ /5_remove-worktree",
	);
	expect(collapse("ciao <!-- pi:cmd /x -->")).toBe("ciao <!-- pi:cmd /x -->");
	expect(collapse("messaggio normale")).toBe("messaggio normale");
	expect(collapse(undefined)).toBeUndefined();
});

test("patch di UserMessageComponent: render collassato, testo completo nascosto, ripristino allo shutdown", async () => {
	initTheme("dark");
	const handlers = new Map<string, () => void>();
	const original = proto().rebuild;
	await collapseCommand({
		on: (e: string, h: () => void) => handlers.set(e, h),
	} as never);

	const full =
		"<!-- pi:cmd /2_work-issue ICH-523 sol -->\n\nPrendi in carico le issue Linear\n\n## Validazione";
	const out = strip(new UserMessageComponent(full).render(80));
	expect(out).toContain("▸ /2_work-issue ICH-523 sol");
	expect(out).not.toContain("Prendi in carico");
	expect(strip(new UserMessageComponent("ciao mondo").render(80))).toContain(
		"ciao mondo",
	);

	handlers.get("session_shutdown")?.();
	expect(proto().rebuild).toBe(original);
	expect(strip(new UserMessageComponent(full).render(80))).toContain(
		"Prendi in carico",
	);
});
