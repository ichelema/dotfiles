% disk, space

# Spazio libero sui dischi (nu, senza filesystem virtuali)
; sys disks  dischi reali con totale e spazio libero
; uniq-by device  una riga per disco (salta i bind mount dello stesso disco)
; uso%  percentuale occupata, calcolata da free e total
```sh
nu -c 'sys disks | uniq-by device | select device type mount total free | insert "uso%" {|d| (1 - $d.free / $d.total) * 100 | math round} | sort-by mount'
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
