% disk, space

# Spazio libero sui dischi (senza filesystem virtuali)
; -h  dimensioni leggibili (K, M, G)
; -T  mostra il tipo di filesystem
; -x  esclude un tipo di filesystem (ripetibile)
```sh
df -hT -x tmpfs -x devtmpfs -x efivarfs -x overlay
```

# Spazio libero sul disco che contiene una cartella
; -h  dimensioni leggibili (K, M, G)
```sh
df -h <cartella>
```

# Inode usati e liberi (disco pieno ma con spazio libero; su btrfs risultano 0, sono dinamici)
; -i  inode invece dello spazio
; -h  numeri leggibili
; -x  esclude un tipo di filesystem (ripetibile)
```sh
df -ih -x tmpfs -x devtmpfs -x efivarfs -x overlay
```

# Analizza lo spazio di una cartella in modo interattivo
; --color dark  colori per sfondo scuro
; -t 4  scansione con 4 thread
```sh
ncdu --color dark -t 4 <cartella>
```

# Analizza tutto il disco di sistema senza entrare in altri dischi
; -x  resta sullo stesso filesystem
; --exclude-kernfs  salta /proc, /sys e simili
; -t 4  scansione con 4 thread
```sh
sudo ncdu --color dark -x -t 4 --exclude-kernfs /
```

# Analizza una cartella escludendo .git, node_modules e cache
; --exclude  salta file e cartelle con quel nome (ripetibile)
; --exclude-caches  salta le cartelle con CACHEDIR.TAG
; -t 4  scansione con 4 thread
```sh
ncdu --color dark -t 4 --exclude .git --exclude node_modules --exclude-caches <cartella>
```

$ cartella: printf '%s\n' "$PWD" "$HOME" / /var /tmp
