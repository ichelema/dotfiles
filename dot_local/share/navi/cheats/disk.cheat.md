% disk, space

# Spazio libero sui dischi (senza filesystem virtuali)
```sh
df -hT -x tmpfs -x devtmpfs -x efivarfs -x overlay
```

# Spazio libero sul disco che contiene una cartella
```sh
df -h <cartella>
```

# Inode usati e liberi (disco pieno ma con spazio libero; su btrfs risultano 0, sono dinamici)
```sh
df -ih -x tmpfs -x devtmpfs -x efivarfs -x overlay
```

# Analizza lo spazio di una cartella in modo interattivo
```sh
ncdu --color dark -t 4 <cartella>
```

# Analizza tutto il disco di sistema senza entrare in altri dischi
```sh
sudo ncdu --color dark -x -t 4 --exclude-kernfs /
```

# Analizza una cartella escludendo .git, node_modules e cache
```sh
ncdu --color dark -t 4 --exclude .git --exclude node_modules --exclude-caches <cartella>
```

$ cartella: printf '%s\n' "$PWD" "$HOME" / /var /tmp
