% archivi, tar

# Crea un archivio .tar.gz
```sh
tar -czf "<nome_archivio>.tar.gz" <percorso>
```

# Crea un archivio .tar.zst (più veloce e compatto di gz)
```sh
tar --zstd -cf "<nome_archivio>.tar.zst" <percorso>
```

# Elenca il contenuto di un archivio senza estrarlo
```sh
tar -tvf "<archivio>"
```

# Estrai un archivio in una cartella
```sh
mkdir -p "<destinazione>" && tar -xf "<archivio>" -C "<destinazione>"
```

$ percorso: ls -A
$ archivio: fd -t f -d 3 -e tar -e gz -e tgz -e zst -e xz -e bz2
$ file_interno: tar -tf "<archivio>"
$ destinazione: echo "./$(basename "<archivio>" | sed -E 's/\.(tar\.(gz|zst|xz|bz2)|tgz|tar)$//')"
