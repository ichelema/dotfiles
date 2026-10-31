#!/usr/bin/env bash
# Header di navi (fzf transform-header): descrizione e comando del cheat selezionato, a capo alla larghezza
# della finestra. $1 = campo 5 (descrizione), $2 = campo 6 (comando, navi codifica gli a-capo come " \x15 ").
sep=$'  ⠀'                       # separatore di campo di navi, fzf lo lascia in coda al campo
desc=${1%"$sep"}
cmd=${2%"$sep"}
w=$(( ${FZF_COLUMNS:-80} - 6 ))      # bordo e margini dell'header
(( w < 20 )) && w=20

# fold conta anche i codici colore: il colore va aggiunto dopo, riga per riga
printf '%s\n' "$desc" | fold -s -w "$w" | sed $'s/^/\e[38;5;12m/; s/$/\e[0m/'

# Note sugli argomenti: righe "; ..." subito sotto "# <descrizione>" nel file cheat (navi le ignora)
cheats=${XDG_DATA_HOME:-$HOME/.local/share}/navi/cheats
awk -v d="# $desc" '$0 == d { f = 1; next } f && /^;/ { sub(/^; ?/, ""); print; next } f { exit }' \
    "$cheats"/*.cheat* 2>/dev/null | fold -s -w "$(( w - 4 ))" | sed $'s/^/\e[38;5;7m    /; s/$/\e[0m/'

printf '%s\n' "$cmd" | sed 's/ \x15 /\n/g' | fold -s -w "$w" | sed $'s/^/\e[38;5;15m/; s/$/\e[0m/'
