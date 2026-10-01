# ~/.config/zsh/modules/msys-path-paste.zsh

_msys_path_paste_convert_one() {
  emulate -L zsh
  setopt extended_glob

  local path="$1"

  # Il drag&drop di alcuni terminali può includere newline o uno spazio finale.
  path="${path//$'\r'/}"
  path="${path//$'\n'/}"
  path="${path##[[:space:]]##}"
  path="${path%%[[:space:]]##}"

  if [[ "$path" == '"'*'"' ]]; then
    path="${path#\"}"
    path="${path%\"}"
  fi

  if [[ "$path" != (#b)[A-Za-z]:(\\|/)* ]]; then
    return 1
  fi

  local converted
  converted="$(/usr/bin/cygpath -u "$path")" || return 1
  print -r -- "${(q)converted}"
}

_msys_path_bracketed_paste() {
  emulate -L zsh

  local pasted converted
  zle .bracketed-paste pasted

  if converted="$(_msys_path_paste_convert_one "$pasted")"; then
    LBUFFER+="$converted"
  else
    LBUFFER+="$pasted"
  fi
}

zle -N bracketed-paste _msys_path_bracketed_paste

# zsh non lega mai il paste nella keymap vicmd: senza questa riga il testo
# incollato in modalità comando viene eseguito come comandi vi.
bindkey -M vicmd '^[[200~' bracketed-paste
