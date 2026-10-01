# ~/.config/zsh/modules/zoxide.zsh

if command -v zoxide >/dev/null 2>&1; then
  _zoxide_init="$(zoxide init zsh --cmd cd 2>/dev/null)"
  _zoxide_init="${_zoxide_init//$'\r'/}"
  [[ -n "$_zoxide_init" ]] && eval "$_zoxide_init"
  unset _zoxide_init
fi
