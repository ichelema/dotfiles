# ~/.config/zsh/modules/keybinds.zsh

zle -N fzf_history_widget

bindkey -v

# CTRL-R usa il tuo widget fzf in tutte le keymap principali
bindkey '^R' fzf_history_widget
bindkey -M emacs '^R' fzf_history_widget
bindkey -M viins '^R' fzf_history_widget
bindkey -M vicmd '^R' fzf_history_widget

# Keybind utili persi con vim mode
bindkey '^P' up-line-or-history
bindkey '^N' down-line-or-history
bindkey '^A' beginning-of-line
bindkey '^E' end-of-line
bindkey '^W' backward-kill-word
bindkey '^H' backward-delete-char
bindkey '^?' backward-delete-char
bindkey '^[[A' up-line-or-history
bindkey '^[[B' down-line-or-history
