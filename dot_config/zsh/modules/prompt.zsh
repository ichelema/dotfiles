# ~/.config/zsh/modules/prompt.zsh
#
# Prompt nativo zsh stile "pure", senza dipendenze esterne.
# Sostituisce oh-my-posh per eliminare il costo di spawn processo per prompt.
# Backup oh-my-posh: prompt.zsh.bak

setopt prompt_subst
autoload -Uz add-zsh-hook add-zle-hook-widget

# --- Vi-mode color tracking ---
# Insert = purple (#B48EAD), normal/vicmd = blue (#81A1C1)
_prompt_arrow_color='#B48EAD'

_prompt_keymap_select() {
	case $KEYMAP in
	vicmd) _prompt_arrow_color='#81A1C1' ;;
	viins | main) _prompt_arrow_color='#B48EAD' ;;
	esac
	zle reset-prompt
}
add-zle-hook-widget zle-keymap-select _prompt_keymap_select

# Reset a "insert" all'inizio di ogni nuova linea
_prompt_line_init() {
	_prompt_arrow_color='#B48EAD'
}
add-zle-hook-widget zle-line-init _prompt_line_init

# --- Console title con path corrente ---
_prompt_title() { print -Pn "\e]0;%~\a"; }
add-zsh-hook precmd _prompt_title

# --- Prompts ---
# prompt_subst espande $_prompt_arrow_color al redraw, non all'assegnazione.
# Riga 1: path in blu. Riga 2: freccia (rosso su errore, altrimenti colore vi-mode).
_PROMPT_FULL=$'%F{#81A1C1}%~%f\n%(?.%F{$_prompt_arrow_color}.%F{#BF616A})❯%f '

# Transient: solo la freccia
_PROMPT_TRANSIENT='%(?.%F{$_prompt_arrow_color}.%F{#BF616A})❯%f '

PROMPT=$_PROMPT_FULL

# --- Transient prompt ---
# Quando la linea viene terminata (Invio, Ctrl-C), ridisegna come freccia sola.
# add-zle-hook-widget coopera con fast-syntax-highlighting che gia' wrappa
# zle-line-finish per la sua highlighting logic.
_prompt_transient_finish() {
	PROMPT=$_PROMPT_TRANSIENT
	zle reset-prompt
	PROMPT=$_PROMPT_FULL
}
add-zle-hook-widget zle-line-finish _prompt_transient_finish
