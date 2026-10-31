% processi

# Cerca processi per nome o riga di comando
; -a  mostra anche la riga di comando
; -f  cerca nella riga di comando completa, non solo nel nome
```sh
pgrep -af <nome>
```

# Processi che usano più CPU
; -e  tutti i processi
; -o  colonne da mostrare
; etime  tempo trascorso dall'avvio
; cmd  riga di comando completa
; --sort=-%cpu  ordina per CPU, dal più alto
```sh
ps -eo pid,user,%cpu,%mem,etime,cmd --sort=-%cpu | head -20
```

# Processi che usano più memoria
; -e  tutti i processi
; -o  colonne da mostrare
; rss  memoria fisica usata, in KiB
; --sort=-%mem  ordina per memoria, dal più alto
```sh
ps -eo pid,user,%cpu,%mem,rss,cmd --sort=-%mem | head -20
```

# Dettagli di un processo
; -o  colonne da mostrare
; -p  solo il PID indicato
; ppid  PID del processo padre
; stat  stato: R in esecuzione, S in attesa, T fermo, Z zombie
```sh
ps -o pid,ppid,user,%cpu,%mem,etime,stat,cmd -p <pid>
```

# Albero dei processi figli di un processo
; -a  mostra gli argomenti
; -p  mostra i PID
; -l  non tronca le righe lunghe
```sh
pstree -apl <pid>
```

# Termina processi in modo pulito (SIGTERM, selezione multipla con Tab)
; senza opzioni  manda SIGTERM: il processo può salvare e chiudersi da solo
```sh
kill <pids>
```

# Forza la chiusura di processi (SIGKILL, selezione multipla con Tab)
; -9  SIGKILL: chiusura immediata, il processo non può salvare né pulire
```sh
kill -9 <pids>
```

# Manda un segnale a un processo
; -s  segnale da mandare, per nome
; HUP  molti servizi ricaricano la configurazione
; STOP / CONT  sospende e riprende il processo
; INT  come Ctrl+C
```sh
kill -s <segnale> <pid>
```

# Termina tutti i processi con quel nome
; -f  confronta con la riga di comando completa: può colpire più processi del previsto
```sh
pkill -f <nome>
```

# Chi è in ascolto su una porta TCP (processi di altri utenti: serve sudo)
; -l  solo socket in ascolto
; -t  solo TCP
; -n  numeri di porta, senza risolvere i nomi
; -p  mostra il processo
; sport = :N  filtra per porta locale
```sh
ss -ltnp "sport = :<porta>"
```

# Termina il processo in ascolto su una porta TCP (processi di altri utenti: serve sudo)
; -k  kill: manda SIGKILL ai processi trovati
; N/tcp  la porta TCP N
```sh
fuser -k <porta>/tcp
```

# Chi sta usando un file o una cartella
; -v  dettagli: utente, PID e tipo di accesso
```sh
fuser -v <percorso>
```

# Cambia la priorità di un processo (19 = minima, -20 = massima, negativi solo con sudo)
; -n  nuovo valore nice
; -p  PID del processo
```sh
renice -n <priorita> -p <pid>
```

$ pid: ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | sed 's/^ *//' --- --column 1 --header-lines 1 --delimiter '\s+'
$ pids: ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | sed 's/^ *//' --- --column 1 --header-lines 1 --delimiter '\s+' --multi --expand
$ segnale: printf '%s\n' TERM HUP INT KILL STOP CONT USR1 USR2
$ porta: ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un
$ priorita: printf '%s\n' 19 10 5 0 -5 -10
