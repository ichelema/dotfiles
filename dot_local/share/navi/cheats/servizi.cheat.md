% servizi, systemd

# Stato di un servizio
```sh
systemctl status <servizio>
```

# Log di un servizio in tempo reale
```sh
journalctl -fu <servizio>
```

# Log di un servizio dall'ultimo avvio del sistema
```sh
journalctl -b -u <servizio> -e
```

# Riavvia un servizio
```sh
sudo systemctl restart <servizio>
```

# Abilita e avvia subito un servizio
```sh
sudo systemctl enable --now <servizio>
```

# Disabilita e ferma subito un servizio
```sh
sudo systemctl disable --now <servizio>
```

# Modifica un servizio con un override (non tocca il file originale)
```sh
sudo systemctl edit <servizio>
```

# Ricarica i file dei servizi dopo una modifica
```sh
sudo systemctl daemon-reload
```

# Servizi falliti
```sh
systemctl --failed
```

# Servizi in esecuzione
```sh
systemctl list-units --type=service --state=running
```

# Timer programmati e prossima esecuzione
```sh
systemctl list-timers
```

# Errori di sistema dall'ultimo avvio
```sh
journalctl -b -p err --no-pager
```

# Stato di un servizio utente
```sh
systemctl --user status <servizio_utente>
```

# Riavvia un servizio utente
```sh
systemctl --user restart <servizio_utente>
```

# Log di un servizio utente in tempo reale
```sh
journalctl --user -fu <servizio_utente>
```

$ servizio: systemctl list-unit-files --type=service --no-legend | awk '{print $1}' | grep -v '@\.service$'
$ servizio_utente: systemctl --user list-unit-files --type=service --no-legend | awk '{print $1}' | grep -v '@\.service$'
