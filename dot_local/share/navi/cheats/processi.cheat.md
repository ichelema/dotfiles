% processi

# Cerca processi per nome o riga di comando
```sh
pgrep -af <nome>
```

# Processi che usano più CPU
```sh
ps -eo pid,user,%cpu,%mem,etime,cmd --sort=-%cpu | head -20
```

# Processi che usano più memoria
```sh
ps -eo pid,user,%cpu,%mem,rss,cmd --sort=-%mem | head -20
```

# Dettagli di un processo
```sh
ps -o pid,ppid,user,%cpu,%mem,etime,stat,cmd -p <pid>
```

# Albero dei processi figli di un processo
```sh
pstree -apl <pid>
```

# Termina processi in modo pulito (SIGTERM, selezione multipla con Tab)
```sh
kill <pids>
```

# Forza la chiusura di processi (SIGKILL, selezione multipla con Tab)
```sh
kill -9 <pids>
```

# Manda un segnale a un processo
```sh
kill -s <segnale> <pid>
```

# Termina tutti i processi con quel nome
```sh
pkill -f <nome>
```

# Chi è in ascolto su una porta TCP (processi di altri utenti: serve sudo)
```sh
ss -ltnp "sport = :<porta>"
```

# Termina il processo in ascolto su una porta TCP (processi di altri utenti: serve sudo)
```sh
fuser -k <porta>/tcp
```

# Chi sta usando un file o una cartella
```sh
fuser -v <percorso>
```

# Cambia la priorità di un processo (19 = minima, -20 = massima, negativi solo con sudo)
```sh
renice -n <priorita> -p <pid>
```

$ pid: ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | sed 's/^ *//' --- --column 1 --header-lines 1 --delimiter '\s+'
$ pids: ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | sed 's/^ *//' --- --column 1 --header-lines 1 --delimiter '\s+' --multi --expand
$ segnale: printf '%s\n' TERM HUP INT KILL STOP CONT USR1 USR2
$ porta: ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un
$ priorita: printf '%s\n' 19 10 5 0 -5 -10
