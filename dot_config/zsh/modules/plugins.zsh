# ~/.config/zsh/modules/plugins.zsh

# --- zsh-autosuggestions ---
# MANUAL_REBIND=1: niente rebind dei widget ZLE ad ogni precmd.
# Su MSYS2 toglie la "scattosita'" sulla cancellazione. I widget custom
# definiti dopo questo modulo richiedono una chiamata esplicita a
# _zsh_autosuggest_bind_widgets (gestita in .zshrc).
ZSH_AUTOSUGGEST_MANUAL_REBIND=1
ZSH_AUTOSUGGEST_STRATEGY=(history)
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=50

[[ -r "$ZDOTDIR/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh" ]] &&
	source "$ZDOTDIR/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh"

# Disattiva l'async DOPO il source: il plugin fa `typeset -g ZSH_AUTOSUGGEST_USE_ASYNC=`
# (zsh-autosuggestions.zsh:863) e lo valuta con ${+VAR} (esistenza, non valore), quindi
# l'unico modo per spegnerlo e' unset. Su MSYS2 l'async forka uno zpty per ogni fetch:
# fork emulato Cygwin = lentissimo. Con strategy=history (in-process) il sync e' piu' veloce.
unset ZSH_AUTOSUGGEST_USE_ASYNC

# [[ -r "$ZDOTDIR/plugins/fast-syntax-highlighting/fast-syntax-highlighting.plugin.zsh" ]] &&
#	source "$ZDOTDIR/plugins/fast-syntax-highlighting/fast-syntax-highlighting.plugin.zsh"
