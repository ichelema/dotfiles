# T3 — Config di Zellij in chezmoi

Chiusa il 2026-10-20. `<config>` = `~/.config/zellij`; source di chezmoi = `~/.local/share/chezmoi` (repo `ichelema/dotfiles`, pubblico).
Parte da [T0](T0-plugin-base.md), [T1](T1-timeoutlen.md) e [T2](T2-leader-in-scroll.md). Quei file usano il percorso `C:/Users/en27553/AppData/Roaming/Zellij/config`: su Windows ora è una junction verso `<config>`.

## Obiettivo

Versionare la config di Zellij e il plugin nel repo dei dotfiles, per Windows e per Linux (macchina Linux e VPS).
Prima la config esisteva solo sul disco del PC Windows, e la sua storia erano i file `.bak`, in parte spariti.

## File nel source

| File | Contenuto |
|---|---|
| `dot_config/zellij/config.kdl.tmpl` | config, con blocchi per OS |
| `dot_config/zellij/layouts/zsh.kdl.tmpl` | layout di default, con blocchi per OS |
| `dot_config/zellij/layouts/cmder.kdl` | solo Windows (`.chezmoiignore.tmpl`) |
| `dot_config/zellij/README.md` | guida dei tasti |
| `dot_config/zellij/plugins/zellij-which-key.wasm` | plugin compilato, nel repo così com'è |
| `dot_config/zellij/plugins/zellij-which-key/` | sorgente Rust, `task.md`, `tasks/`; `.cargo` diventa `dot_cargo` |
| `dot_local/bin/executable_nvim-win.sh` | Neovim nativo di Windows, solo Windows |
| `.chezmoiignore.tmpl` | fuori `target/` e `*.bak*`; su Linux fuori anche `cmder.kdl` e `nvim-win.sh` |
| `.chezmoiscripts/run_onchange_after_windows-junctions.sh.tmpl` | junction `%APPDATA%\Zellij\config` → `~/.config/zellij` |
| `CLAUDE.md` del repo | righe Zellij e Neovim nativo; junction nella sezione Script |

## Blocchi per OS

| | Windows | Linux |
|---|---|---|
| `n` / `h` del leader | `Run` di `env.exe` con la zsh MSYS2 UCRT64 | `NewPane "Right"` / `NewPane "Down"` |
| Pannello iniziale (`zsh.kdl`) | `pane command=env.exe …` | `pane` (shell di default) |
| `scrollback_editor` | `bash.exe …/nvim-win.sh +` | `nvim +` |
| Plugin in `load_plugins` | `file:D:/msys64/home/Sphynx/.config/zellij/plugins/zellij-which-key.wasm` | `file:<home>/.config/zellij/plugins/zellij-which-key.wasm` |

I percorsi di MSYS2 vengono da `.chezmoi.homeDir` (`D:/msys64/home/Sphynx`), con variabili in testa ai due template:
`$msys` = `D:/msys64`, `$homeWin` = `D:\\msys64\\home\\Sphynx` (con l'escape di KDL), `$msysWin` = `D:\\msys64`, `$homeSh` = `/d/msys64/home/Sphynx`.
Se MSYS2 cambia disco, basta `chezmoi apply`.

## Scelte e motivi

- **Junction e non variabile con `setx`.** Nel repo la junction è la regola per i programmi nativi (vim, git, nvim). Vale per ogni avvio, anche nei programmi già aperti, e i vecchi percorsi restano validi. WezTerm usa invece la variabile `WEZTERM_CONFIG_FILE`, perché legge un solo file accanto a `wezterm.exe` e una junction collega solo cartelle.
- **`ZELLIJ_CONFIG_DIR` resta com'era** in `env.zsh` e in `launch.lua`. L'alias `claude` sposta USERPROFILE, e Zellij calcola AppData da USERPROFILE.
- **Riga del plugin con `{{ $home }}`.** `joinPath` su Windows scrive `\`, che in KDL è un escape. `file:~/…` non va bene: su Windows Zellij espande `~` nel profilo Windows, non nella home MSYS2. Codice: `RunPluginLocation::parse` in `zellij-utils/src/input/layout.rs`.
- **`scrollback_editor "nvim +"`.** Zellij separa comando e argomenti (`separate_command_arguments` in `zellij-server/src/os_input_output.rs`) e aggiunge il file in fondo.
- **`NewPane` su Linux.** È un pannello normale, nella cartella del pannello attivo, che si chiude con la shell. Un `Run` resta aperto dopo l'uscita: senza `close_on_exit`, `hold_on_close` vale vero (`zellij-utils/src/kdl/mod.rs`).
- **`.wasm` nel repo.** Sulle altre macchine non serve Rust. Ogni nuova build aggiunge circa 2,2 MB alla storia.
- **Messaggio di commit** nel formato della storia del repo (`feat(scope): …`), non `Added: …` come dice il `CLAUDE.md` del repo.

## Migrazione (2026-10-20)

1. File copiati nel source, template scritti a mano.
2. `C:/Users/en27553/AppData/Roaming/Zellij/config` rinominata in `config.pre-chezmoi.bak`, che contiene ancora `target/` (382 MB) e i backup di T1 e T2.
3. `chezmoi apply`: ha scritto `<config>` e creato la junction.

## Verifica

- Windows: `chezmoi cat` confrontato con i file di prima. Cambia solo la riga del plugin in `config.kdl`; `zsh.kdl` è identico.
- Linux simulato con `chezmoi execute-template --override-data '{"chezmoi":{"os":"linux","homeDir":"/home/ichelema"}}'`. Cambiano solo `n`/`h`, la riga del plugin e `scrollback_editor`; `zellij setup --check` risponde Well defined.
- `zellij setup --check` attraverso la junction: Well defined.
- Sessione di prova (procedura di T0, `--config-dir` sulla junction):
  - il plugin parte dal nuovo URL e chiede i permessi; ha risposto `y` l'utente, che guardava la finestra;
  - `Alt+.` → `p`: riquadro Pannelli;
  - `Alt+.` → `n`: zsh MSYS2 a destra, nella stessa cartella; `Alt+.` → `p` → `c` la chiude;
  - `Alt+.` → `e`: `nvim.exe` sul file dello scrollback;
  - ricaricamento: con il tasto temporaneo `Alt y` → `NewTab` nel source e `chezmoi apply`, `Alt+y` apre `Tab #2`. Il tasto è stato poi tolto.
- Zellij 0.45 controlla `config.kdl` ogni secondo (`PollWatcher` in `watch_config_file_changes`, `zellij-utils/src/input/config.rs`) e vede la modifica attraverso la junction.
- Non tutte le opzioni si ricaricano: `reconfigure` in `zellij-server/src/screen.rs` aggiorna tasti, tema e altre opzioni, ma non `pane_frames`.

## Come provare dal vivo

Come in T0, con tre differenze:

- Per uscire da un modo usa `q`. Un `Esc` mandato da solo con `send-text` resta in sospeso, e Zellij lo unisce ai tasti della chiamata successiva (`Action NoOp` nel log).
- Dopo `Ctrl+q` la sessione è EXITED: basta `zellij delete-session wk-test`, senza `--force`.
- L'utente può guardare la finestra di prova e rispondere lui ai prompt: rileggi lo schermo prima di mandare tasti.

## VPS Infomaniak (2026-10-20)

- Arch Linux, Zellij 0.45.1, shell di login `/usr/bin/zsh`: `NewPane` apre la zsh senza `default_shell`.
- Aveva una config scritta a mano il 2026-09-28: leader `Ctrl g`, base `normal`, `Ctrl w` per i pannelli, compact-bar. L'utente ha scelto di sostituirla con quella del repo.
- Backup sulla VPS: `~/.config/zellij/config.kdl.pre-chezmoi.bak` e `layouts/zsh.kdl.pre-chezmoi.bak` (chezmoi li ignora).
- Passi: `chezmoi git -- pull --ff-only`, `chezmoi diff`, `chezmoi apply`. SSH da MSYS2 con `SSH_AUTH_SOCK=~/.ssh/agent.sock`, l'agent con la chiave `infomaniak_vps`.
- Verifica: `chezmoi status` vuoto; `zellij setup --check` Well defined; `config.kdl` e `zsh.kdl` identici al render Linux fatto su Windows; `.wasm` con lo stesso sha256.

## Limiti noti

- Macchina Linux principale: config non ancora applicata. Prima di `chezmoi update` controlla `zellij --version` (plugin per 0.45.1) ed esegui `chezmoi diff`, perché un `~/.config/zellij` esistente viene sostituito.
- VPS: non provata dal vivo (riquadro, `n`/`h`, `Alt+.` → `e` con `nvim +`).
- Se un programma rimette una cartella reale al posto della junction, Zellij legge quella. Lo script non ricrea la junction da solo: chezmoi riesegue uno script `run_onchange_` solo quando cambia il suo testo.
- `config.kdl` e `zsh.kdl` sono template, quindi `chezmoi re-add` non li aggiorna: una modifica fatta nella destinazione va riportata nel source.
- `config.pre-chezmoi.bak` resta in `%APPDATA%\Zellij`, finché l'utente non decide di cancellarla.
