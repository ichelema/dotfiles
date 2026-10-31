% archivi, tar

# Crea un archivio .tar.gz
; -c  crea un archivio
; -z  comprime con gzip
; -f  nome del file archivio
```sh
tar -czf "<nome_archivio>.tar.gz" <percorso>
```

# Crea un archivio .tar.zst (più veloce e compatto di gz)
; --zstd  comprime con zstd
; -c  crea un archivio
; -f  nome del file archivio
```sh
tar --zstd -cf "<nome_archivio>.tar.zst" <percorso>
```

# Elenca il contenuto di un archivio senza estrarlo
; -t  elenca il contenuto
; -v  dettagli: permessi, dimensione, data
; -f  file archivio
```sh
tar -tvf "<archivio>"
```

# Estrai un archivio in una cartella
; -x  estrae
; -f  file archivio
; -C  cartella di destinazione (deve esistere: per questo mkdir -p)
; la compressione (gz, zst, xz) è riconosciuta da sola
```sh
mkdir -p "<destinazione>" && tar -xf "<archivio>" -C "<destinazione>"
```

$ percorso: ls -A
$ archivio: fd -t f -d 3 -e tar -e gz -e tgz -e zst -e xz -e bz2
$ file_interno: tar -tf "<archivio>"
$ destinazione: echo "./$(basename "<archivio>" | sed -E 's/\.(tar\.(gz|zst|xz|bz2)|tgz|tar)$//')"
