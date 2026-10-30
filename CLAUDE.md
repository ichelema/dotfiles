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
| Windows aziendale (principale) | `D:\msys64\home\Sphynx` (home MSYS2) | chezmoi si lancia da MSYS2 |
| Linux | `~` | Trinity in `/Dati/AI/Claude/Trinity` |

Su Windows esistono **due home**: MSYS2 (`D:\msys64\home\Sphynx`: Claude Code, Pi, LiteLLM) e
quella di Windows (`C:\Users\en27553`: gvim, nvim, Git for Windows). chezmoi scrive solo nella
prima; i programmi nativi ci arrivano tramite **junction** (`mklink /J`). Symlink e hardlink non
sono utilizzabili: i symlink richiedono la Developer Mode, gli hardlink non attraversano i volumi.

## Config locale (`~/.config/chezmoi/chezmoi.toml`, non versionata)

Su Windows contiene, oltre a `[edit]` (gvim `-f`) e `[merge]` (WinMerge):
- `[diff] pager = ""`: diff testuale. WinMerge come diff bloccava `chezmoi apply -v`.
- `[interpreters.sh] command = "D:/msys64/usr/bin/bash.exe"`: path completo, perché `bash` da un
  processo nativo trova prima la bash WSL di System32.
- `encryption = "age"` + `[age] identity = "~/.config/chezmoi/key.txt"`, `recipient = "age1z0nc…r0fn"`.

Sulla VPS contiene anche `[data] vps = true`. I template riconoscono la VPS solo da questo flag
(`index . "vps"`: `zshrc.linux`, `HINDSIGHT_SSH_TUNNEL` in `claude-settings.json`), mai
dall'hostname: con un'altra VPS o un hostname nuovo basta il flag.

Su una macchina nuova vanno ricreati a mano il blocco `[age]`, su Windows `[interpreters.sh]` e,
su una VPS, `[data] vps = true`.

## Segreti (age)

- age è quello integrato in chezmoi (nessun binario esterno; non supporta passphrase).
- La chiave privata `~/.config/chezmoi/key.txt` **non è mai nel repo**: si copia a mano (scp) sulle
  altre macchine. Se si perde, i file cifrati non sono più recuperabili.
- Finché la chiave manca, `.chezmoiignore.tmpl` salta i file cifrati invece di far fallire l'apply.
- File cifrati oggi:
  - `private_dot_litellm/encrypted_private_master-key.txt.age` → `~/.litellm/master-key.txt`
    (cartella 0700, file 0600, senza fine riga finale).
  - `dot_config/zsh/encrypted_private_api-keys.zsh.age` → `~/.config/zsh/api-keys.zsh` (0600, solo
    Linux, caricato da `.zshenv`): gli `export` delle API key. Su Windows le stesse variabili sono
    variabili utente. Contiene `TYPESAFE_API_KEY`, che il template di `settings.json` legge con
    `env` durante l'apply: senza, il blocco `jev-skill-suggestion` sparisce.
  - `.secrets/anthropic-api-key.age`: non è un target (chezmoi ignora i path che iniziano con
    `.`); lo decifra a runtime la funzione zsh `q` con `chezmoi decrypt`.
- Per aggiungere una riga a un file cifrato senza scrivere il testo in chiaro su disco:
  `{ chezmoi decrypt F; printf 'export NOME="%s"\n' "$NOME"; } | chezmoi encrypt > F.nuovo`,
  poi controlla `chezmoi decrypt F.nuovo` e sostituisci `F`.

## Cosa è gestito

| Cosa | Source | Note |
|---|---|---|
| Git | `dot_config/git/config.tmpl`, `ignore` | Path XDG (niente `~/.gitconfig`: se esiste ha la precedenza). Blocchi per OS: WinMerge/gvim, `sslCAInfo` aziendale solo se `C:/certs/cacert.pem` esiste, helper `gh` trovato con `lookPath` |
| Vim | `dot_config/vim/` | vim-plug. `plugged/` e `files/*` (undo, view…) sono ignorati. I plugin non si installano da soli: `:PlugInstall` |
| Neovim | `.chezmoiexternal.toml` | Repo esterno `ichelema/neovim_config` in `~/.config/nvim` |
| Neovim nativo (solo Windows) | `dot_local/bin/executable_nvim-win.sh` | Lancia `C:\Appl\Neovim\bin\nvim.exe` senza le variabili MSYS2 (`HOME`, `XDG_*`, `SHELL`) e con git-for-windows in testa al `PATH`. Lo usano la funzione zsh `nvim`, yazi, WezTerm (`utils/open-file.lua`) e `scrollback_editor` di Zellij |
| Claude Code | `dot_claude/`, `.chezmoitemplates/claude-settings.json` | `settings.json` è un modify-template (`dot_claude/modify_settings.json`): il contenuto viene da `.chezmoitemplates/claude-settings.json`, con blocchi per OS (`env`, `model`, comando di `statusLine`). Dal file sul disco conserva solo `model`, `modelSettings` e `fastMode`; ogni altra chiave scritta da Claude a runtime viene tolta al prossimo `apply`, quindi le modifiche da tenere vanno riportate nel template (`re-add` non funziona). Il ramo non-Windows di `env` contiene percorsi della macchina Linux principale (`/Dati/...`). Skill, hook e MCP vengono dal plugin Trinity, non da qui |
| Pi agent | `dot_pi/agent/` | Solo config. Fuori: `auth.json`, `sessions/`, `npm/`, `git/`, `tmp/`, `node_modules`, `*.bak`. `AGENTS.md.tmpl` ha blocchi per OS (ambiente, validatori, percorsi). `settings.json` è un modify-template (`.chezmoitemplates/pi-settings.json`) che conserva `lastChangelogVersion`, `defaultModel`, `defaultProvider` scritti da Pi a runtime |
| LiteLLM | `private_dot_litellm/`, `dot_local/bin/executable_litellm-*` | Config, moduli (`callbacks.py`, `responses_bridge.py`), test, launcher. `master-key.txt` cifrata; `logs/` locale. Dopo `apply` riavviare il proxy. Su Linux `litellm-proxy-run.py`, `litellm-start-proxy.sh` e `litellm-pg-ensure.py` sono ignorati (lì restano le versioni Linux locali) |
| mise | `dot_config/mise/config.toml.tmpl` | Versioni globali dei runtime; base comune + blocco solo Linux |
| zsh (solo Windows) | `dot_zshenv`, `dot_config/zsh/` (`.zshrc`, `modules/`, `functions/`) | Config MSYS2; su Linux è ignorata e resta quella locale. Plugin (`fast-syntax-highlighting`, `fzf-tab`, `zsh-autosuggestions`) come `git-repo` in `.chezmoiexternal.toml`. Fuori: `.histfile`, `.zcompdump*`, `*.bak*`. `mise.zsh` mette in `PATH` anche `~/.local/bin/lua-language-server/bin` (serve al plugin `lua-lsp`) |
| Zellij | `dot_config/zellij/` | `config.kdl.tmpl` e `layouts/zsh.kdl.tmpl` hanno un blocco per OS: su Windows la zsh MSYS2 tramite `env.exe` e `scrollback_editor` con `nvim-win.sh`, con i percorsi di MSYS2 ricavati da `.chezmoi.homeDir`; su Linux `NewPane` e `nvim +`. Plugin which-key: sorgente Rust in `plugins/zellij-which-key/` (storia in `task.md` e `tasks/`) e `.wasm` compilato nel repo: dopo una build, `chezmoi re-add` del `.wasm`. Fuori: `target/`, `*.bak*`. `layouts/cmder.kdl` solo Windows. Su Windows Zellij legge `%APPDATA%\Zellij\config`, junction verso `~/.config/zellij` |
| kitty (solo Linux) | `dot_config/kitty/` | `kitty.conf.tmpl` include il tema di Hyprland (`~/.config/hypr/themes/current/…`) solo se non è la VPS (`index . "vps"`). `userprefs.conf` non è un template: i suoi `{{{` sono marcatori di fold di vim. `open-actions.conf` + `vscode-link-open.sh`: i link `vscode://file/<path>[:riga[:col]]` di prismantis si aprono in nvim invece che nel browser. `quick-access-terminal.conf` (Wayland) è ignorato sulla VPS; tutta la cartella è ignorata su Windows. Fuori: `main.json` (stato della finestra) e `__pycache__` |
| Claude Desktop (solo Windows) | `dot_local/bin/executable_claude_code_desktop*.cmd` | Launcher con PATH e env MSYS2. CRLF conservati da `.gitattributes` (`*.cmd -text`): non modificarli con `sed -i` di MSYS2, che toglie i `\r` |
| Ruby REPL, ctags | `dot_irbrc`, `dot_irbrc_rails`, `dot_pryrc`, `dot_ctags` | Solo config: le cronologie (`.irb_history`, `.pry_history`) restano locali |

## Script

- `.chezmoiscripts/run_onchange_after_windows-junctions.sh.tmpl` (solo Windows): crea le junction
  `C:\Users\en27553\vimfiles` e `~/vimfiles` → `~/.config/vim`, `C:\Users\en27553\.config\git` →
  `~/.config/git`, `%LOCALAPPDATA%\nvim` → `~/.config/nvim`, `%APPDATA%\Zellij\config` →
  `~/.config/zellij`. Se al posto della junction trova una
  cartella reale la salta: spostarla in `.bak` e rilanciare `apply`.

## Note

- Questo `CLAUDE.md` è escluso dal deploy (`.chezmoiignore.tmpl`).
