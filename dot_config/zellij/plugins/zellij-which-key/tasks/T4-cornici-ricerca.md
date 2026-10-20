# T4 — Cornici durante la ricerca

Chiusa il 2026-10-20. `<config>` = `~/.config/zellij`. Parte da [T0](T0-plugin-base.md); il codice sta nel repo dei dotfiles ([T3](T3-chezmoi.md)).

## Problema

Con `Alt+.` → `c` → `s` (o `Alt+.` → `/`) la ricerca parte, ma non vedi il testo che scrivi.
Zellij lo scrive solo nella cornice del pannello: `Enter search...`, poi `SEARCHING: <testo>` (`render_frame` in `zellij-server/src/panes/terminal_pane.rs`).
La config ha `pane_frames false`, quindi la cornice non c'è. Le occorrenze si colorano comunque mentre scrivi.
In più il riquadro dei tasti si chiude nel modo EnterSearch (scelta di T0), quindi dopo `s` non resta nulla a schermo.

## Modifica

Solo `src/main.rs`, solo nel guardiano. La config non cambia.

- Campo `frames_before_search: Option<PaneFrameStyle>`: stile delle cornici prima della ricerca; `Some` = cornici accese dal guardiano.
- In `mode_update()`, dopo il controllo `changed`:
  - entrando in EnterSearch o Search, se `frames_before_search` è `None`: salva lo stile e chiama `set_pane_frame_style(PaneFrameStyle::Full)`;
  - in ogni altro modo, se `frames_before_search` è `Some`: rimette lo stile salvato.
- EnterSearch → Search (`Invio`) non cambia nulla: tutti e due sono "ricerca".

Il riquadro dei tasti resta nascosto in EnterSearch: con la cornice l'utente vede già cosa scrive.
I permessi non cambiano: `SetPaneFrameStyle` chiede `ChangeApplicationState`, che il plugin ha già.

## Scelte e motivi

- **Plugin e non tasti.** Nei tasti c'è solo `TogglePaneFrames`, che inverte lo stato (ciclo Full → Titles → None → Full, `screen.rs`). Servirebbe su ogni ingresso e ogni uscita (`Esc`, `q`, `Invio`, `Ctrl+c`, in due modi): un'uscita dimenticata lascia le cornici accese per sempre. Il guardiano invece vede ogni cambio di modo e `set_pane_frame_style` imposta un valore preciso.
- **Stile Full e non Titles.** Titles non disegna la riga del titolo quando nella tab c'è un solo pannello (`set_pane_frames` in `zellij-server/src/panes/tiled_panes/mod.rs`): il testo della ricerca non comparirebbe.
- **Stile di partenza "spente".** Il guardiano è un plugin in background: riceve `pane_frame_style: None`, perché `get_mode_info` (`zellij-utils/src/input/mod.rs`) lo lascia vuoto e `Tab::update_input_modes` lo compila solo per i plugin delle tab. Il codice tratta `None` come cornici spente, cioè `pane_frames false`.
- Proposte scartate: suggerimenti nel riquadro durante la ricerca (i plugin non ricevono il testo cercato); `pane_frames true` fisso (cornici sempre, anche fuori dalla ricerca).

## Build

`target/` riportata da `%APPDATA%\Zellij\config.pre-chezmoi.bak`: build release in 12 secondi, senza warning.
Poi copia del `.wasm`, `chezmoi re-add` di `.wasm` e `main.rs`, commit.

## Verifica (2026-10-20)

Sessione di prova come in T0, in una finestra WezTerm separata.

- `Alt+.` → `c` → `s`: cornice con `Enter search...`; scrivendo `beta`: `SEARCHING: beta`.
- `Invio`: la cornice resta, compare il riquadro Ricerca.
- `q` (Search → base): cornici spente.
- `Alt+.` → `/`: cornice con `Enter search...`; `Ctrl+c` (EnterSearch → Scroll): cornici spente.
- Ricerca di `42` dopo `seq 1 200`, uscita con `q`: il pannello resta sul risultato, cornici spente, nessuna riga ripetuta.
- Il ridisegno completo (cambio di tab) mostra lo stesso contenuto: le righe ripetute del limite sotto sono nel pannello, non un residuo del disegno.
- `Esc` non provato direttamente: con `wezterm cli send-text` un `Esc` da solo resta in sospeso (vedi T3). Fa gli stessi cambi di modo di `q` (Search → base) e di `Ctrl+c` (EnterSearch → Scroll), che sono provati.

## Limiti noti

- **Righe ripetute in un pannello quasi vuoto.** Se il contenuto non riempie il pannello e esci dalla ricerca con `q`, `Esc` o `Invio`, le prime 2 righe possono comparire due volte (riprodotto con `printf` di 3 righe; al secondo giro non si ripete). Con `Ctrl+c`, che riporta il pannello in fondo prima di uscire, e con lo schermo pieno non succede. Viene dal ridimensionamento del pannello in Zellij 0.45.1 (cornice accesa e spenta); non ho trovato la causa nel codice, perché il sorgente di Zellij non era più disponibile.
- I pannelli cambiano dimensione di 2 righe e 2 colonne all'ingresso e all'uscita: i programmi a schermo intero si ridisegnano.
- Le cornici valgono per tutta la sessione: compaiono in tutte le tab, non solo in quella della ricerca.
- Con `pane_frames true` nella config, uscire dalla ricerca spegnerebbe le cornici (il guardiano non conosce lo stile vero). Vale finché Zellij rilegge la config o fino alla sessione successiva.
- Se il guardiano si ferma durante una ricerca, le cornici restano accese fino alla fine della sessione.
- Le sessioni già aperte prima dell'aggiornamento non hanno la funzione: il guardiano si carica all'avvio della sessione.
