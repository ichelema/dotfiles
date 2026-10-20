# T2 — Alt+. anche nel modo scroll

Chiusa il 2026-10-20. `<config>` = `C:/Users/en27553/AppData/Roaming/Zellij/config`.
Nessuna modifica al plugin: cambia solo la configurazione di Zellij.

## Problema

Zellij 0.45 ha l'opzione `scroll_mode_sync`, attiva per default.
Se il pannello attivo è scorso in alto e il client è nella base, Zellij lo porta nel modo Scroll; quando il pannello torna in fondo, lo riporta alla base.
Nel modo scroll `Alt+.` non era legato, quindi il leader non rispondeva finché il pannello non tornava in fondo con `Ctrl+c`.

## Modifica

`<config>/config.kdl`, blocco `scroll`:

```kdl
// leader anche qui: con il pannello scorso in alto Zellij resta in scroll (scroll_mode_sync)
bind "Alt ." { SwitchToMode "normal"; }
```

`<config>/README.md`: riga `ALT+.` nella tabella "Scroll e ricerca".
Backup: `<config>/config.kdl.t1-t2.bak`, `<config>/README.md.t1-t2.bak`.

## Perché funziona

- `sync_scroll_mode_on_focus` in `zellij-server/src/screen.rs` cambia solo la coppia base ↔ Scroll. Un client in Normal, Pane o Tab non viene riportato in Scroll.
- Il guardiano vede Scroll → Normal come un cambio dopo il leader, perché il modo precedente non è la base. Apre il riquadro dopo il ritardo di [T1](T1-timeoutlen.md).

## Scelte

- Solo il modo `scroll`, come richiesto. Nel modo Ricerca `Alt+.` resta senza azione: da lì serve prima `Esc`.
- Alternativa scartata: `scroll_mode_sync false`. Toglierebbe il passaggio automatico allo scroll su cui conta `Alt+PgUp`.
- Nel riquadro dello Scroll `Alt+.` non compare: ha la stessa azione che in locked, quindi conta come tasto diretto (filtro di [T0](T0-plugin-base.md)).

## Verifica (2026-10-20)

Sessione di prova come in T0, con `timeoutlen 300`.

- `seq 1 300` nella zsh, poi `Alt+PgUp`: scroll senza riquadro.
- `Alt+.` dentro lo scroll: leader e, dopo il ritardo, riquadro `Leader`.
- `Alt+.` → `c`: riquadro `Scroll` senza la voce `Alt .`.
- `Ctrl+c`: pannello in fondo, riquadro chiuso.
- `zellij setup --check`: Well defined.
