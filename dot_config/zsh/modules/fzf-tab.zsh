# ~/.config/zsh/modules/fzf-tab.zsh
#
# Carica fzf-tab: sostituisce il menu di completamento di zsh con un'interfaccia
# fzf (utile per liste lunghe come `mise <tab>`, 94 voci).
#
# Ordine: va sorgiato DOPO la completion nativa di fzf (modulo `fzf.zsh`, che
# sorgia /ucrt64/share/fzf/completion.zsh e ribinda ^I a fzf-completion):
# altrimenti fzf ruba il binding TAB a fzf-tab. Nel loader di .zshrc sta quindi
# subito dopo `fzf`. zsh-autosuggestions (MANUAL_REBIND) viene ribindato in fondo
# al .zshrc, quindi l'ordine rispetto a `plugins` qui non e' un problema.
# Il menu nativo zsh e' disabilitato (`menu no` in compinit.zsh), come richiede fzf-tab.

[[ -r "$ZDOTDIR/plugins/fzf-tab/fzf-tab.plugin.zsh" ]] &&
	source "$ZDOTDIR/plugins/fzf-tab/fzf-tab.plugin.zsh"
