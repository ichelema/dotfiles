# ~/.config/zsh/modules/compinit.zsh

zstyle :compinstall filename "$ZSH_CONFIG/.zshrc"

# Completion zsh dei pacchetti UCRT64 installati da pacman (eza, bat, fd, rg,
# delta, cargo, ...): la loro dir non e' nel fpath di default. Va aggiunta PRIMA
# di compinit perche' le funzioni _* vengano marcate per autoload.
[[ -d /ucrt64/share/zsh/site-functions ]] &&
  fpath=(/ucrt64/share/zsh/site-functions $fpath)

autoload -Uz compinit

_zcompdump="$ZSH_CONFIG/.zcompdump"

if [[ -f "$_zcompdump" ]]; then
  compinit -C -d "$_zcompdump"
else
  compinit -d "$_zcompdump"
fi

unset _zcompdump

# fzf-tab gestisce il menu di completamento: il menu nativo zsh va disabilitato
zstyle ':completion:*' menu no
