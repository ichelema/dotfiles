# ~/.config/zsh/modules/fzf.zsh

# source /ucrt64/share/fzf/key-bindings.zsh
if [[ -o interactive && -t 0 && -t 1 &&
      -r /ucrt64/share/fzf/completion.zsh ]]; then
  source /ucrt64/share/fzf/completion.zsh
fi

export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'
