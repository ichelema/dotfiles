% file, cartelle

# Lista dettagliata, cartelle prima (alias ll)
; -l  formato lungo
; -h  riga di intestazione delle colonne
; -a  anche i file nascosti
; --group-directories-first  cartelle prima dei file
```sh
eza -lha --icons=auto --sort=name --group-directories-first <cartella>
```

# Solo le cartelle (alias ld)
; -1  una voce per riga
; -D  solo cartelle
```sh
eza -1D --icons=auto <cartella>
```

# Albero con profondità scelta (alias lt1, lt2, lt3)
; -a  anche i file nascosti
; -T  vista ad albero
; --level  profondità massima
```sh
eza -aT --level=<livello> --icons=auto <cartella>
```

# Albero senza i file ignorati da git
; --git-ignore  nasconde i file ignorati da .gitignore
; -T  vista ad albero
; --level  profondità massima
```sh
eza -T --git-ignore --level=<livello> --icons=auto <cartella>
```

# File ordinati per data di modifica (i più recenti in fondo)
; -l  formato lungo
; -h  riga di intestazione delle colonne
; --sort=modified  ordina per data di modifica
```sh
eza -lh --sort=modified --icons=auto <cartella>
```

# Dimensione delle sottocartelle, ordinate
; -h  dimensioni leggibili
; -d1  profondità 1: solo le sottocartelle dirette
; sort -h  ordina dimensioni leggibili
```sh
du -h -d1 <cartella> 2>/dev/null | sort -h
```

# Cerca file e cartelle per nome
; -H  include i file nascosti
```sh
fd -H <nome> <cartella>
```

# File modificati di recente
; -H  include i file nascosti
; -t f  solo file
; --changed-within  modificati entro: 1h, 1d, 7d...
```sh
fd -H -t f --changed-within <tempo> . <cartella>
```

# File più grandi di una dimensione
; -H  include i file nascosti
; -t f  solo file
; -S +N  più grandi di N
; -X  passa tutti i risultati insieme a du
```sh
fd -H -t f -S +<dimensione> . <cartella> -X du -h | sort -h
```

# Cerca un testo nei file
; --smart-case  ignora maiuscole se il testo è tutto minuscolo
```sh
rg --smart-case "<testo>" <cartella>
```

$ cartella: printf '%s\n' . "$HOME"; fd -t d -d 2
$ livello: printf '%s\n' 1 2 3 4
$ tempo: printf '%s\n' 1h 1d 7d 30d
$ dimensione: printf '%s\n' 100M 500M 1G

% file, alias

# Entra in una cartella scelta con fzf e anteprima (ffcd)
```sh
ffcd
```

# Entra in una cartella frequente scelta con fzf (zf, da zoxide)
```sh
zf
```

# Salta a una cartella frequente scrivendo parte del nome (cd di zoxide)
```sh
cd <parte_nome>
```

# Apri nell'editor un file scelto con fzf e anteprima (ffe)
```sh
ffe
```

# Cerca un testo nei file e apri quello scelto nell'editor (ffec)
```sh
ffec "<testo>"
```

# File manager yazi, all'uscita resti nella cartella scelta (y)
```sh
y
```

# File manager superfile, all'uscita resti nella cartella scelta (spf)
```sh
spf
```

# Cerca testo con risultati colorati da delta (rg)
```sh
rg "<testo>"
```

# Estrai qualsiasi archivio (x, plugin extract)
```sh
x <archivio>
```

$ parte_nome: zoxide query -l | xargs -n1 basename | sort -u
$ archivio: fd -t f -d 3 -e tar -e gz -e tgz -e zst -e xz -e bz2 -e zip -e 7z -e rar
