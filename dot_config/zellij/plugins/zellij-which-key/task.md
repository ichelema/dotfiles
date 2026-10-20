# Task — plugin zellij-which-key

Elenco delle attività sul plugin e sulla configurazione di Zellij che lo usa.
Ogni task chiusa rimanda a un file in `tasks/` con il riferimento di come è stata implementata.
Prima di cambiare una parte, leggi il file della task che l'ha introdotta.

## Come si usa questo file

- Task aperta: `- [ ]`, con obiettivo e criteri di accettazione.
- Task chiusa: `- [x]`, data di chiusura e link al file `tasks/<ID>-<nome>.md`.
- Il file di riferimento contiene: obiettivo, file toccati, scelte e motivi, verifica, limiti noti.
- `<config>` = `~/.config/zellij` (su Windows la home MSYS2); il plugin sta in `<config>/plugins/zellij-which-key/`.
- Dal T3 la config è nel repo dei dotfiles (chezmoi): modifica il source `~/.local/share/chezmoi/dot_config/zellij/`, poi `chezmoi apply`.
- Su Windows `C:/Users/en27553/AppData/Roaming/Zellij/config`, il percorso usato da T0-T2, è una junction verso `<config>`: i loro comandi valgono ancora.

## Task

- [x] **T0 — Plugin di base** (chiusa il 2026-10-19) → [tasks/T0-plugin-base.md](tasks/T0-plugin-base.md)
  Riquadro in stile which-key: guardiano in background e riquadro floating, descrizioni automatiche con override.
- [x] **T1 — Ritardo come timeoutlen** (chiusa il 2026-10-20) → [tasks/T1-timeoutlen.md](tasks/T1-timeoutlen.md)
  Il riquadro compare solo se resti in un modo per `timeoutlen` ms (default 300, opzione nel blocco del plugin in `<config>/config.kdl`).
- [x] **T2 — Alt+. anche nel modo scroll** (chiusa il 2026-10-20) → [tasks/T2-leader-in-scroll.md](tasks/T2-leader-in-scroll.md)
  `bind "Alt ."` nel blocco `scroll` di `<config>/config.kdl`: il leader risponde anche con il pannello scorso in alto.
- [x] **T3 — Config in chezmoi** (chiusa il 2026-10-20) → [tasks/T3-chezmoi.md](tasks/T3-chezmoi.md)
  Config e plugin nel repo dei dotfiles, con un blocco per Windows e uno per Linux; su Windows una junction collega `%APPDATA%\Zellij\config` a `<config>`.

## Punti aperti (non pianificati)

- `<config>/README.md`, riga 20: descrive i nomi dei modi nella barra della compact-bar. Dipende dalla scelta tra tab-bar e compact-bar in `<config>/layouts/zsh.kdl`.
- Tab con il layout `cmder.kdl`: non provata dal vivo dopo la rimozione di `tooltip "F1"`.
- Nel modo Ricerca `Alt+.` non ha azione: da lì serve prima `Esc` (scelta di T2).
- VPS Infomaniak: config applicata il 2026-10-20 (vedi T3), non ancora provata dal vivo; al primo avvio Zellij chiede il permesso del plugin.
- Macchina Linux principale: config non ancora applicata. Prima di `chezmoi update` controlla `zellij --version` (il plugin è compilato per 0.45.1) ed esegui `chezmoi diff` (un `~/.config/zellij` esistente viene sostituito).
