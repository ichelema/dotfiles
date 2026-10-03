# ~/.config/zsh/modules/chezmoi.zsh
#
# Genera/cacha il completamento zsh per chezmoi e lo registra via compdef.
# Il file viene rigenerato solo quando il binario chezmoi e' piu' nuovo
# della cache (es. dopo `pacman -Syu`). Pattern coerente con mise.zsh.

((${+commands[chezmoi]})) || return

() {
	emulate -L zsh

	local chezmoi_binary=${commands[chezmoi]}
	local cachedir="${XDG_CACHE_HOME:-$HOME/.cache}/chezmoi/zsh-msys"
	local functions_dir="$cachedir/functions"
	local compfile="$functions_dir/_chezmoi"

	mkdir -p "$functions_dir"

	if [[ ! -e $compfile || $compfile -ot $chezmoi_binary ]]; then
		"$chezmoi_binary" completion zsh >|"$compfile"
		print -u2 -PR "%F{cyan}*%f Detected a new version of 'chezmoi'. Regenerated completions."
	fi

	fpath=("$functions_dir" ${fpath:#$functions_dir})

	# compinit ha gia' scansionato fpath all'avvio: la _chezmoi appena
	# generata non e' nella autoload table, quindi va registrata a mano.
	autoload -Uz _chezmoi

	if (($+functions[compdef])); then
		compdef _chezmoi chezmoi 2>/dev/null
	fi
}
