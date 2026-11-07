#!/usr/bin/env bash
# Apre in nvim il path di un link vscode://file/<path>[:riga[:colonna]] (emesso da prismantis).
# Chiamato da open-actions.conf con ${FILE_PATH}, che include il suffisso :riga:colonna.
p=$1
f=$p l="" c=""
if [[ $p =~ ^(.*):([0-9]+):([0-9]+)$ && -e ${BASH_REMATCH[1]} ]]; then
  f=${BASH_REMATCH[1]} l=${BASH_REMATCH[2]} c=${BASH_REMATCH[3]}
elif [[ $p =~ ^(.*):([0-9]+)$ && -e ${BASH_REMATCH[1]} ]]; then
  f=${BASH_REMATCH[1]} l=${BASH_REMATCH[2]}
fi
if [[ -n $l ]]; then
  exec nvim "+call cursor($l,${c:-1})" -- "$f"
fi
exec nvim -- "$f"
