% rsync

; Barra finale sulla sorgente: "dir/" copia il CONTENUTO di dir, "dir" copia la cartella stessa dentro la destinazione

# Copia o aggiorna una cartella (solo i file cambiati, mantiene permessi e date)
```sh
rsync -avh --progress "<sorgente>" "<destinazione>"
```

# Anteprima: mostra cosa farebbe senza toccare niente (dry-run)
```sh
rsync -avhn --delete "<sorgente>" "<destinazione>"
```

# Mirror: destinazione identica alla sorgente (CANCELLA i file in più nella destinazione)
```sh
rsync -avh --delete --progress "<sorgente>" "<destinazione>"
```

# Copia escludendo .git, node_modules e cache
```sh
rsync -avh --progress --exclude '.git' --exclude 'node_modules' --exclude '.cache' "<sorgente>" "<destinazione>"
```

# Invia a un server via SSH (compresso)
```sh
rsync -avhz --progress "<sorgente>" "<host>:<percorso_remoto>"
```

# Scarica da un server via SSH (compresso)
```sh
rsync -avhz --progress "<host>:<percorso_remoto>" "<destinazione>"
```

# Riprendi un trasferimento interrotto di file grandi
```sh
rsync -avh --partial --append-verify --progress "<sorgente>" "<destinazione>"
```

# Sposta: copia e poi cancella i file dalla sorgente (le cartelle vuote restano)
```sh
rsync -avh --remove-source-files --progress "<sorgente>" "<destinazione>"
```

$ sorgente: printf '%s\n' ./; fd -t d -d 2
$ host: awk 'tolower($1)=="host" && $2 !~ /[*?]/ {print $2}' ~/.ssh/config 2>/dev/null
