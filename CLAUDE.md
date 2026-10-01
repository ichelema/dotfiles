# CLAUDE.md

Repo chezmoi dei dotfiles di `ichelema` (`git@github.com:ichelema/dotfiles.git`).
Sintassi e comandi di chezmoi: skill globale `chezmoi`. Qui solo come è fatto **questo** setup.

## Regole

- **Il repo è PUBBLICO.** Mai segreti in chiaro: si aggiungono con `chezmoi add --encrypt`
  (age, vedi sotto). Prima di ogni commit controllare il diff staged.
- Si modifica il **source**, mai il target. Prima di `apply`: `chezmoi diff` (è testuale, nessun
  programma esterno).
- Sincronizzazione solo manuale: commit + push qui, `chezmoi update` sulle altre macchine.
- Commenti negli script in italiano. Commit nel formato `Added: …` / `Changed: …` / `Fixed: …` /
  `Removed: …`.

## Macchine e home

| Macchina | Destinazione chezmoi | Note |
|---|---|---|
| Windows aziendale (principale) | `E:\msys64\home\Sphynx` (home MSYS2) | chezmoi si lancia da MSYS2. `E:` è un `subst` di `D:` |
| Linux | `~` | Trinity in `/Dati/AI/Claude/Trinity` |

Su Windows esistono **due home**: MSYS2 (`E:\msys64\home\Sphynx`: Claude Code, Pi, LiteLLM) e
quella di Windows (`C:\Users\en27553`: gvim, nvim, Git for Windows). chezmoi scrive solo nella
prima; i programmi nativi ci arrivano tramite **junction** (`mklink /J`). Symlink e hardlink non
sono utilizzabili: i symlink richiedono la Developer Mode, gli hardlink non attraversano i volumi.

## Config locale (`~/.config/chezmoi/chezmoi.toml`, non versionata)

Su Windows contiene, oltre a `[edit]` (gvim `-f`) e `[merge]` (WinMerge):
- `[diff] pager = ""`: diff testuale. WinMerge come diff bloccava `chezmoi apply -v`.
- `[interpreters.sh] command = "E:/msys64/usr/bin/bash.exe"`: path completo, perché `bash` da un
  processo nativo trova prima la bash WSL di System32.
- `encryption = "age"` + `[age] identity = "~/.config/chezmoi/key.txt"`, `recipient = "age1z0nc…r0fn"`.

Su una macchina nuova vanno ricreati a mano il blocco `[age]` e, su Windows, `[interpreters.sh]`.

## Segreti (age)

- age è quello integrato in chezmoi (nessun binario esterno; non supporta passphrase).
- La chiave privata `~/.config/chezmoi/key.txt` **non è mai nel repo**: si copia a mano (scp) sulle
  altre macchine. Se si perde, i file cifrati non sono più recuperabili.
- Finché la chiave manca, `.chezmoiignore.tmpl` salta i file cifrati invece di far fallire l'apply.
- File cifrati oggi: `dot_litellm/encrypted_master-key.txt.age`.

## Cosa è gestito

| Cosa | Source | Note |
|---|---|---|
| Git | `dot_config/git/config.tmpl`, `ignore` | Path XDG (niente `~/.gitconfig`: se esiste ha la precedenza). Blocchi per OS: WinMerge/gvim, `sslCAInfo` aziendale solo se `C:/certs/cacert.pem` esiste, helper `gh` trovato con `lookPath` |
| Vim | `dot_config/vim/` | vim-plug. `plugged/` e `files/*` (undo, view…) sono ignorati. I plugin non si installano da soli: `:PlugInstall` |
| Neovim | `.chezmoiexternal.toml` | Repo esterno `ichelema/neovim_config` in `~/.config/nvim` |
| Claude Code | `dot_claude/` | `settings.json.tmpl` è un template unico con blocchi per OS (`env`, `statusLine`, `model`, `enabledPlugins`). chezmoi possiede l'intero file: se Claude lo riscrive a runtime, `apply` chiede prima di sovrascrivere; le modifiche da tenere vanno riportate nel template (`re-add` non funziona sui template). Skill, hook e MCP vengono dal plugin Trinity, non da qui |
| Pi agent | `dot_pi/agent/` | Solo config. Fuori: `auth.json`, `sessions/`, `npm/`, `git/`, `tmp/`, `node_modules`, `*.bak`. Pi riscrive `settings.json` a runtime: `chezmoi re-add` prima del commit |
| LiteLLM | `dot_litellm/`, `dot_local/bin/executable_litellm-*` | Config, moduli (`callbacks.py`, `responses_bridge.py`), test, launcher. `master-key.txt` cifrata; `logs/` locale. Dopo `apply` riavviare il proxy. Su Linux `litellm-proxy-run.py`, `litellm-start-proxy.sh` e `litellm-pg-ensure.py` sono ignorati (lì restano le versioni Linux locali) |
| mise | `dot_config/mise/config.toml` | Versioni globali dei runtime |
| zsh (solo Windows) | `dot_zshenv`, `dot_config/zsh/` (`.zshrc`, `modules/`, `functions/`) | Config MSYS2; su Linux è ignorata e resta quella locale. Plugin (`fast-syntax-highlighting`, `fzf-tab`, `zsh-autosuggestions`) come `git-repo` in `.chezmoiexternal.toml`. Fuori: `.histfile`, `.zcompdump*`, `*.bak*`. `mise.zsh` mette in `PATH` anche `~/.local/bin/lua-language-server/bin` (serve al plugin `lua-lsp`) |
| Claude Desktop (solo Windows) | `dot_local/bin/executable_claude_code_desktop*.cmd` | Launcher con PATH e env MSYS2. CRLF conservati da `.gitattributes` (`*.cmd -text`): non modificarli con `sed -i` di MSYS2, che toglie i `\r` |
| Ruby REPL, ctags | `dot_irbrc`, `dot_irbrc_rails`, `dot_pryrc`, `dot_ctags` | Solo config: le cronologie (`.irb_history`, `.pry_history`) restano locali |

## Script

- `.chezmoiscripts/run_onchange_after_windows-junctions.sh.tmpl` (solo Windows): crea le junction
  `C:\Users\en27553\vimfiles` e `~/vimfiles` → `~/.config/vim`, `C:\Users\en27553\.config\git` →
  `~/.config/git`, `%LOCALAPPDATA%\nvim` → `~/.config/nvim`. Se al posto della junction trova una
  cartella reale la salta: spostarla in `.bak` e rilanciare `apply`.

## Note

- Questo `CLAUDE.md` è escluso dal deploy (`.chezmoiignore.tmpl`).
