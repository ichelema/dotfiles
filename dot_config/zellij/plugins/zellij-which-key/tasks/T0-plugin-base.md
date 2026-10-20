# T0 — Plugin di base

Chiusa il 2026-10-19. Zellij 0.45.1 su Windows, configurazione "Unlock First": base `locked`, leader `Alt+.` → `normal`.
`<config>` = `C:/Users/en27553/AppData/Roaming/Zellij/config`.
Modifiche successive: [T1](T1-timeoutlen.md) (ritardo del riquadro), [T2](T2-leader-in-scroll.md) (`Alt+.` nel modo scroll).

## Obiettivo

Riquadro in stile which-key di Neovim: mostra i tasti del modo attivo con una descrizione.
Sostituisce il tooltip della compact-bar, che ha una lista fissa e non mostra, per esempio, il pin e `r`, `z`, `p` in Pannelli.

## File

| Cosa | Percorso |
|---|---|
| Logica del plugin | `src/main.rs` |
| Griglia (testabile senza Zellij) | `src/grid.rs` |
| Build | `Cargo.toml` (`zellij-tile = "=0.45.1"`), `.cargo/config.toml` (target `wasm32-wasip1`) |
| Plugin installato | `<config>/plugins/zellij-which-key.wasm`, copia di `target/wasm32-wasip1/release/zellij-which-key.wasm` |
| Attivazione e override | `<config>/config.kdl`, blocco `load_plugins` |
| Guida utente | `<config>/README.md`, sezione "Riquadro dei tasti" |
| Modifiche collegate | `<config>/layouts/cmder.kdl`: tolto `tooltip "F1"` dalla compact-bar, altrimenti nelle tab cmder comparivano due riquadri |

Backup delle modifiche alla config: `config.kdl.which-key.bak`, `layouts/cmder.kdl.which-key.bak`, `README.md.which-key.bak`.
Il 2026-10-20 questi backup non c'erano più. Dal [T3](T3-chezmoi.md) la storia della config è nel repo dei dotfiles.

## Architettura

Lo stesso `.wasm` gira in due esemplari. Lo schema viene dal tooltip della compact-bar (`default-plugins/compact-bar/src/main.rs` nel sorgente di Zellij 0.45.1).

- **Guardiano**: caricato da `load_plugins`, gira in background. Zellij lo mette in un pannello soppresso con `tab_index` None, quindi riceve ModeUpdate e TabUpdate di ogni tab.
- Quando entri nel leader, il guardiano apre il riquadro con `pipe_message_to_plugin`: URL `zellij:OWN_URL`, configurazione propria più `popup "true"`, coordinate floating.
- **Riquadro**: stesso URL, configurazione diversa, quindi esemplare diverso. Nasce floating, con pin e senza focus: per i plugin aperti da pipe `should_focus` vale false.
- Il pin lo tiene visibile anche quando i floating sono nascosti (`Alt+f`), senza mostrare gli altri floating.
- A ogni cambio di modo il riquadro cambia dimensione e titolo (`change_floating_panes_coordinates`, `rename_plugin_pane`).
- Segue la tab attiva con `break_panes_to_tab_with_index(.., false)` e si chiude con `close_self()` quando torni alla base.
- Se il riquadro esiste già o sta caricando, Zellij gli consegna il messaggio e non ne apre un altro (`plugin_id_of_loading_plugin` in `wasm_bridge.rs`).

## Regole del contenuto

- Voci: i tasti del modo attivo, meno quelli identici nella base (i tasti diretti `Alt+…`).
- Descrizioni automatiche in italiano: `label()` traduce le azioni, `describe()` le combina.
- `+Modo`: il tasto apre solo un altro modo (gruppo). `esci`: il tasto torna alla base e va nel titolo.
- Override: righe `"<modo> <tasto>" "<testo>"` nel blocco del plugin. Il tasto si legge con `KeyWithModifier::from_str`, cioè con la sintassi di `bind`; il modo con `InputMode::from_str`.
- I tasti con la stessa descrizione diventano una voce sola, per esempio `← h  allarga ←`.
- Ordine: prima i gruppi, poi l'ordine di `KeyWithModifier`.
- Griglia: più colonne possibile nella larghezza del viewport, riempite dall'alto in basso, ogni colonna con la sua larghezza.
- Posizione: x assente, così Zellij centra il riquadro; y = 9999, così `adjust_coordinates` (`zellij-utils/src/pane_size.rs`) lo appoggia in fondo.
- Modi senza riquadro: la base, Locked, EnterSearch, RenameTab, RenamePane, Prompt.
- Dalla base si apre solo con il leader: `Alt+PgUp` entra in scroll senza riquadro.

## Errori trovati nel test dal vivo, già corretti

1. **Tasti vuoti.** Nella decodifica di ModeUpdate (`zellij-utils/src/plugin_api/event.rs`) un tasto non convertibile fa sparire tutti i tasti del suo modo. Il plugin usa `EventType::InitialKeybinds`, che scarta solo il tasto difettoso, e conserva i tasti in `self.keybinds`. Con questa sottoscrizione ModeUpdate arriva con `keybinds` vuoto.
2. **Primo `Alt+.` ignorato.** Con il permesso già salvato il guardiano può non ricevere il modo iniziale. Il default di `ModeInfo.mode` è Normal, quindi il primo Normal non risultava un cambio. Il plugin usa `last_mode: Option<InputMode>`.
3. `set_selectable(false)` si chiama solo dopo `PermissionRequestResult(Granted)`: prima l'utente deve poter rispondere alla richiesta dei permessi.

## Permessi

`ReadApplicationState`, `ChangeApplicationState`, `MessageAndLaunchOtherPlugins`.
Zellij li salva per URL del `.wasm` in `permissions.kdl`, nella sua cache.

## Ambiente

- Build: serve il pacchetto pacman `mingw-w64-ucrt-x86_64-rust-wasm` (1.98.1, come il rustc UCRT64; porta anche `lld` e `wasm-component-ld`).

  ```bash
  cd /c/Users/en27553/AppData/Roaming/Zellij/config/plugins/zellij-which-key
  CARGO_HTTP_CHECK_REVOKE=false cargo build --release
  cp target/wasm32-wasip1/release/zellij-which-key.wasm ../zellij-which-key.wasm
  ```

  La prima build compila 132 crate in 4,5 minuti; le successive durano circa 7 secondi. `CARGO_HTTP_CHECK_REVOKE=false` serve per il proxy aziendale.
- Test della griglia, senza dipendenze:

  ```bash
  rustc --edition 2021 --test src/grid.rs -o target/grid-test.exe && target/grid-test.exe
  ```

- Due cache di Zellij. Avviato dal menu di WezTerm, zellij.exe usa `C:/Users/en27553/AppData/Local/Zellij/cache`. Avviato da una shell MSYS2, che imposta `USERPROFILE=D:\msys64\home\Sphynx`, usa `D:/msys64/home/Sphynx/AppData/Local/Zellij/cache`. Permessi e sessioni sono separati.
- Socket delle sessioni: `%TEMP%\zellij\contract_version_1\<sessione>`, con una named pipe dello stesso nome. La CLI `zellij action` raggiunge una sessione solo con la stessa TMP e TEMP del server.
- Log: `%TEMP%\zellij\zellij-log\zellij.log`. Su NTFS la data di modifica si aggiorna in ritardo mentre il file è aperto.
- Zellij 0.45 esegue i plugin con l'interprete Wasmi e rilegge il `.wasm` a ogni nuovo esemplare. Il guardiano però resta quello caricato all'avvio della sessione.

## Come provare dal vivo

1. Apri una sessione di prova in una finestra WezTerm nuova, con una TMP dedicata. Il comando stampa l'id del pannello WezTerm.

   ```bash
   WS='D:\msys64\tmp\zj'   # una cartella qualsiasi
   /c/Appl/WezTerm/wezterm.exe cli spawn --new-window --cwd 'D:/AI/Claude/Trinity' -- 'D:/msys64/usr/bin/env.exe' "TMP=$WS" "TEMP=$WS" 'D:/msys64/home/Sphynx/.local/bin/zellij.exe' --config-dir 'C:/Users/en27553/AppData/Roaming/Zellij/config' -s wk-test
   ```

2. Invia i tasti con `wezterm cli send-text --pane-id <id> --no-paste $'\x1b.'` (`Alt+.`), poi le lettere. Una chiamata può contenere più tasti, per esempio `$'\x1b.p'`. Ogni chiamata della CLI dura circa 1,4 s.
3. Leggi lo schermo con `wezterm cli get-text --pane-id <id>`.
4. Leggi lo stato con `TMP=$WS TEMP=$WS zellij -s wk-test action list-clients` (pannello con il focus) e `list-panes -a -s -t`.
5. Chiudi con `Alt+.` → `w` → `Ctrl+q` nella finestra, poi `zellij delete-session wk-test --force`. Controlla con `ps -W | grep -i zellij` che non restino processi.

La prima sessione chiede i permessi del plugin; nella cache MSYS2 sono già salvati.
Un pannello scorso in alto, per esempio dopo `Alt+PgUp`, tiene Zellij in Scroll: `Ctrl+c` lo riporta in fondo.
Se i tasti del leader finiscono in `Action NoOp` nel log, la causa è questa. Il 2026-10-19 l'avevo attribuita per errore ai tasti attaccati.

## Verifiche fatte

- Riquadri giusti per Leader, Pannelli, Tab, Sessioni, Scroll, Resize e Ricerca.
- `Esc` chiude il riquadro; `Alt+PgUp` scorre senza riquadro; durante la scrittura della ricerca il riquadro non c'è.
- Il riquadro segue il cambio di tab.
- Con il riquadro aperto il focus resta sulla zsh (`list-clients`); c'è un solo riquadro.
- Test della griglia: 5 su 5.

## Limiti noti

- `target/` occupa circa 380 MB.
- Nessun repository git: la storia sta in `task.md` e in `tasks/`.
