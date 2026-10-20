# T1 — Ritardo come timeoutlen

Chiusa il 2026-10-20. Parte da [T0](T0-plugin-base.md). `<config>` = `C:/Users/en27553/AppData/Roaming/Zellij/config`.

## Obiettivo

Come `timeoutlen` di which-key: il riquadro compare solo se resti in un modo per un certo tempo.
Chi digita la sequenza di corsa non vede il riquadro.

## File toccati

| File | Modifica |
|---|---|
| `src/main.rs` | costante `DEFAULT_TIMEOUTLEN_MS`; campi `delay`, `pending_timers`, `armed`; lettura di `timeoutlen` in `load()`; sottoscrizione `EventType::Timer`; ramo `Event::Timer`; parte del guardiano in `mode_update()` |
| `<config>/config.kdl` | `timeoutlen 300` nel blocco del plugin, dentro `load_plugins` |
| `<config>/README.md` | paragrafo "Come funziona" e sezione "Riquadro dei tasti" |

Backup: `src/main.rs.t1.bak`, `<config>/config.kdl.t1-t2.bak`, `<config>/README.md.t1-t2.bak`.

## Come funziona

- `timeoutlen` (ms) arriva dalla configurazione del plugin; senza valore vale 300. In `load()` diventa `delay`, in secondi.
- A ogni cambio di modo il guardiano calcola `armed`: vero se il modo vuole il riquadro, cioè non è nascosto ed è raggiunto dal leader.
- Se `armed` è vero, il guardiano incrementa `pending_timers` e chiama `set_timeout(delay)`. Con `delay` 0 apre subito, come prima di T1.
- Su `Event::Timer` il guardiano decrementa `pending_timers`. Apre il riquadro solo se è l'ultimo timer (`pending_timers == 0`) e `armed` è ancora vero.
- Effetto: il ritardo riparte a ogni cambio di modo. Un ritorno alla base prima della scadenza mette `armed` a falso.
- Il riquadro già aperto non usa il ritardo: riceve lui ModeUpdate e si aggiorna subito. I timer successivi del guardiano mandano un messaggio al riquadro esistente, che lo ignora.

## Scelte e motivi

- Contatore e non id: `Event::Timer` porta solo il tempo trascorso, quindi il plugin non sa quale timer è scaduto. Il contatore fa debounce: conta solo l'ultimo.
- Niente orologio (`Instant`) nel plugin: confrontare il tempo trascorso con `delay` richiederebbe una tolleranza arbitraria.
- `armed` invece di ricontrollare il modo alla scadenza: il modo corrente non dice se ci si è arrivati dal leader. Esempio: leader, `Esc`, `Alt+PgUp` entro il ritardo non deve aprire il riquadro.
- Default 300 ms: valore consigliato da which-key v2 (`vim.o.timeoutlen = 300`). which-key v3 usa 200 ms (opzione `delay`).
- `Timer` e `set_timeout` non chiedono permessi: vedi `check_event_permission` in `zellij-server/src/plugins/wasm_bridge.rs`.

## Verifica (2026-10-20)

Sessione di prova come in T0, con la TMP dedicata.

- `\x1b.p\x1b` (`Alt+.`, `p`, `Esc`) in una sola `send-text`: nessun riquadro. Le righe `Bye from plugin` del log restano 55, quindi nessun riquadro è stato creato.
- `\x1b.p` in una sola chiamata: riquadro `Pannelli` dopo il ritardo.
- Copia della config nello scratchpad con `timeoutlen 5000`: nessun riquadro a 2,0 s dal tasto, riquadro a 7,8 s. Il valore della config viene letto.
- `cargo build --release` senza warning; `zellij setup --check`: Well defined.

Ogni chiamata a `wezterm cli` o `zellij action` dura circa 1,4 s su questo PC. Per misurare un ritardo serve un `timeoutlen` lungo, in una copia della config.

## Limiti noti

- Se un evento Timer andasse perso, `pending_timers` non tornerebbe a 0 e il riquadro non comparirebbe più fino a una nuova sessione. In Zellij 0.45.1 il timer è un `tokio::time::sleep` che manda sempre l'evento (`set_timeout` in `zellij-server/src/plugins/zellij_exports.rs`).
- Una modifica a `timeoutlen` vale dalla sessione successiva: il guardiano legge la configurazione all'avvio.
