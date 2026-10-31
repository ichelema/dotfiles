% rsync

; Barra finale sulla sorgente: "dir/" copia il CONTENUTO di dir, "dir" copia la cartella stessa dentro la destinazione

# Copia o aggiorna una cartella (solo i file cambiati, mantiene permessi e date)
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; --progress  avanzamento di ogni file
```sh
rsync -avh --progress "<sorgente>" "<destinazione>"
```

# Anteprima: mostra cosa farebbe senza toccare niente (dry-run)
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; -n  dry-run: simula, non scrive niente
; --delete  mostra anche cosa verrebbe cancellato nella destinazione
```sh
rsync -avhn --delete "<sorgente>" "<destinazione>"
```

# Mirror: destinazione identica alla sorgente (CANCELLA i file in più nella destinazione)
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; --delete  cancella nella destinazione i file che non esistono nella sorgente
; --progress  avanzamento di ogni file
```sh
rsync -avh --delete --progress "<sorgente>" "<destinazione>"
```

# Copia escludendo .git, node_modules e cache
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; --progress  avanzamento di ogni file
; --exclude  salta file e cartelle con quel nome (ripetibile)
```sh
rsync -avh --progress --exclude '.git' --exclude 'node_modules' --exclude '.cache' "<sorgente>" "<destinazione>"
```

# Invia a un server via SSH (compresso)
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; -z  comprime i dati durante il trasferimento
; --progress  avanzamento di ogni file
; host:percorso  destinazione remota via SSH
```sh
rsync -avhz --progress "<sorgente>" "<host>:<percorso_remoto>"
```

# Scarica da un server via SSH (compresso)
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; -z  comprime i dati durante il trasferimento
; --progress  avanzamento di ogni file
; host:percorso  sorgente remota via SSH
```sh
rsync -avhz --progress "<host>:<percorso_remoto>" "<destinazione>"
```

# Riprendi un trasferimento interrotto di file grandi
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; --partial  tiene i file a metà se il trasferimento si interrompe
; --append-verify  riprende dalla fine del file parziale e verifica il risultato
; --progress  avanzamento di ogni file
```sh
rsync -avh --partial --append-verify --progress "<sorgente>" "<destinazione>"
```

# Sposta: copia e poi cancella i file dalla sorgente (le cartelle vuote restano)
; -a  archivio: ricorsivo, mantiene link, permessi, date, gruppo e proprietario
; -v  elenca i file trasferiti
; -h  dimensioni leggibili (K, M, G)
; --remove-source-files  cancella dalla sorgente i file copiati (non le cartelle)
; --progress  avanzamento di ogni file
```sh
rsync -avh --remove-source-files --progress "<sorgente>" "<destinazione>"
```

$ sorgente: printf '%s\n' ./; fd -t d -d 2
$ host: awk 'tolower($1)=="host" && $2 !~ /[*?]/ {print $2}' ~/.ssh/config 2>/dev/null
