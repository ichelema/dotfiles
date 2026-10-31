% pacchetti, arch

# Informazioni su un pacchetto installato
```sh
pacman -Qi <pacchetto>
```

# Informazioni su un pacchetto dei repository (anche non installato)
```sh
pacman -Si <pacchetto_repo>
```

# Installa un pacchetto dei repository
```sh
sudo pacman -S <pacchetto_repo>
```

# Rimuovi un pacchetto con le dipendenze non più usate
```sh
sudo pacman -Rns <pacchetto>
```

# Albero delle dipendenze di un pacchetto
```sh
pactree <pacchetto>
```

# Dipendenze dirette di un pacchetto (solo primo livello)
```sh
pactree -d1 <pacchetto>
```

# Chi dipende da un pacchetto (dipendenze inverse)
```sh
pactree -r <pacchetto>
```

# A quale pacchetto appartiene un file
```sh
pacman -Qo <percorso_file>
```

# File installati da un pacchetto
```sh
pacman -Ql <pacchetto>
```

# Pacchetti installati esplicitamente (non come dipendenza)
```sh
pacman -Qe
```

# Pacchetti installati da AUR o fuori dai repository
```sh
pacman -Qm
```

# Pacchetti orfani (dipendenze non più richieste)
```sh
pacman -Qtd
```

# Pacchetti che occupano più spazio
```sh
expac -H M '%m\t%n' | sort -h | tail -20
```

# Ultimi pacchetti installati o aggiornati
```sh
expac --timefmt='%Y-%m-%d %T' '%l\t%n %v' | sort | tail -30
```

# Aggiornamenti disponibili senza aggiornare
```sh
checkupdates
```

# Pulisci la cache tenendo le ultime 2 versioni (e niente dei pacchetti disinstallati)
```sh
sudo paccache -rk2 && sudo paccache -ruk0
```

$ pacchetto: pacman -Qq
$ pacchetto_repo: pacman -Slq | sort -u
