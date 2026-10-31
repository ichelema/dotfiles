% servizi, systemd

# Stato di un servizio
; status  attivo o no, PID, memoria usata e ultime righe di log
```sh
systemctl status <servizio>
```

# Log di un servizio in tempo reale
; -f  segue il log in tempo reale (Ctrl+C per uscire)
; -u  solo questa unit
```sh
journalctl -fu <servizio>
```

# Log di un servizio dall'ultimo avvio del sistema
; -b  solo dall'ultimo avvio del sistema
; -u  solo questa unit
; -e  apre il log già alla fine
```sh
journalctl -b -u <servizio> -e
```

# Riavvia un servizio
; restart  ferma e riavvia il servizio
; sudo -A  serve per i servizi di sistema
```sh
sudo systemctl restart <servizio>
```

# Abilita e avvia subito un servizio
; enable  avvio automatico al boot
; --now  lo avvia anche subito
```sh
sudo systemctl enable --now <servizio>
```

# Disabilita e ferma subito un servizio
; disable  niente avvio automatico al boot
; --now  lo ferma anche subito
```sh
sudo systemctl disable --now <servizio>
```

# Modifica un servizio con un override (non tocca il file originale)
; crea un file in /etc/systemd/system/<servizio>.d/override.conf
```sh
sudo systemctl edit <servizio>
```

# Ricarica i file dei servizi dopo una modifica
; da lanciare dopo aver modificato un file .service a mano
```sh
sudo systemctl daemon-reload
```

# Servizi falliti
; --failed  solo le unit in stato di errore
```sh
systemctl --failed
```

# Servizi in esecuzione
; --type=service  solo servizi
; --state=running  solo quelli in esecuzione
```sh
systemctl list-units --type=service --state=running
```

# Timer programmati e prossima esecuzione
; NEXT / LEFT  prossima esecuzione e tempo che manca
; LAST / PASSED  ultima esecuzione
; ACTIVATES  servizio lanciato dal timer
```sh
systemctl list-timers
```

# Errori di sistema dall'ultimo avvio
; -b  solo dall'ultimo avvio
; -p err  priorità errore o più grave
; --no-pager  stampa tutto, senza pager
```sh
journalctl -b -p err --no-pager
```

# Stato di un servizio utente
; --user  servizi dell'utente, non di sistema: niente sudo
```sh
systemctl --user status <servizio_utente>
```

# Riavvia un servizio utente
; --user  servizi dell'utente, non di sistema: niente sudo
```sh
systemctl --user restart <servizio_utente>
```

# Log di un servizio utente in tempo reale
; --user  log dei servizi dell'utente
; -f  segue il log in tempo reale
; -u  solo questa unit
```sh
journalctl --user -fu <servizio_utente>
```

$ servizio: systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -v '@\.service$'
$ servizio_utente: systemctl --user list-unit-files --type=service --no-legend | awk '{print $1}' | grep -v '@\.service$'
