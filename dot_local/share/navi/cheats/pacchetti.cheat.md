% pacchetti, arch

# Informazioni su un pacchetto installato
; -Q  query sui pacchetti installati
; -i  informazioni dettagliate
```sh
pacman -Qi <pacchetto>
```

# Informazioni su un pacchetto dei repository (anche non installato)
; -S  agisce sui repository (sync)
; -i  informazioni dettagliate
```sh
pacman -Si <pacchetto_repo>
```

# Installa un pacchetto dei repository
; -S  scarica e installa dai repository
```sh
sudo pacman -S <pacchetto_repo>
```

# Rimuovi un pacchetto con le dipendenze non più usate
; -R  rimuove il pacchetto
; -n  cancella anche i file di configurazione
; -s  rimuove le dipendenze non usate da altri pacchetti
```sh
sudo pacman -Rns <pacchetto>
```

# Albero delle dipendenze di un pacchetto
; senza opzioni  albero completo delle dipendenze
```sh
pactree <pacchetto>
```

# Dipendenze dirette di un pacchetto (solo primo livello)
; -d1  profondità massima 1: solo le dipendenze dirette
```sh
pactree -d1 <pacchetto>
```

# Chi dipende da un pacchetto (dipendenze inverse)
; -r  reverse: pacchetti che dipendono da questo
```sh
pactree -r <pacchetto>
```

# A quale pacchetto appartiene un file
; -Q  query sui pacchetti installati
; -o  owns: chi possiede il file
```sh
pacman -Qo <percorso_file>
```

# File installati da un pacchetto
; -Q  query sui pacchetti installati
; -l  list: elenca i file del pacchetto
```sh
pacman -Ql <pacchetto>
```

# Pacchetti installati esplicitamente (non come dipendenza)
; -Q  query sui pacchetti installati
; -e  explicit: installati a mano, non come dipendenza
```sh
pacman -Qe
```

# Pacchetti installati da AUR o fuori dai repository
; -Q  query sui pacchetti installati
; -m  foreign: non presenti nei repository (AUR, manuali)
```sh
pacman -Qm
```

# Pacchetti orfani (dipendenze non più richieste)
; -Q  query sui pacchetti installati
; -d  installati come dipendenza
; -t  non più richiesti da nessun pacchetto
```sh
pacman -Qtd
```

# Pacchetti che occupano più spazio (nu)
; %m  spazio occupato una volta installato, in byte
; %n  nome del pacchetto
; from tsv  trasforma le righe separate da tab in tabella
; into filesize  byte → dimensione leggibile (MB, GB)
```sh
nu -c 'expac "%m\t%n" | from tsv --noheaders | rename dimensione nome | update dimensione {into filesize} | sort-by dimensione | last 20'
```

# Ultimi pacchetti installati o aggiornati (nu, date relative)
; --timefmt=%s  data come secondi dal 1970
; %l  data di installazione o aggiornamento
; %n %v  nome e versione
; into datetime  vuole nanosecondi: per questo * 1_000_000_000
```sh
nu -c 'expac --timefmt=%s "%l\t%n\t%v" | from tsv --noheaders | rename data nome versione | update data {into int | $in * 1_000_000_000 | into datetime} | sort-by data | last 30'
```

# Aggiornamenti disponibili senza aggiornare
; usa una copia temporanea del database: non tocca quello di sistema
```sh
checkupdates
```

# Pulisci la cache tenendo le ultime 2 versioni (e niente dei pacchetti disinstallati)
; -r  rimuove pacchetti dalla cache
; -k2  tiene le ultime 2 versioni di ogni pacchetto
; -u  solo i pacchetti disinstallati
; -k0  non tiene nessuna versione
```sh
sudo paccache -rk2 && sudo paccache -ruk0
```

$ pacchetto: pacman -Qq
$ pacchetto_repo: pacman -Slq | sort -u
