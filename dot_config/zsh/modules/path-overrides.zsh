# ~/.config/zsh/modules/path-overrides.zsh
#
# PATH overrides che devono sopravvivere all'attivazione di mise.
# Caricato DOPO mise.zsh per evitare che il suo "export PATH" cached
# (in ~/.cache/mise/zsh-msys/mise-activate.zsh) li sovrascriva.
#
# Aggiungi qui qualunque directory custom che vuoi avere a priorita' alta:
# binari Windows nativi, tool installati manualmente, override puntuali.

export PATH="/c/Appl/Vim:/c/Appl/Neovim/bin:/c/Appl/PowerShell:/c/Users/EN27553/AppData/Local/Programs/Obsidian/:/c/Users/Sphynx/AppData/Local/Programs/Obsidian/:$HOME/.local/bin:$PATH"
# export PATH="/c/Appl/Neovim/bin:/c/Appl/PowerShell:$HOME/.local/bin:$PATH"

# claude-code-router (ccr) verifica il servizio con `tasklist`: serve C:\Windows\System32 nel PATH
path+=(/c/Windows/System32)

# Dedupe (uniq) preservando l'ordine
typeset -U path
# Cleanup di segmenti spuri lasciati dal parser MSYS<->Win
path=(${path:#C})
path=(${path:#})
