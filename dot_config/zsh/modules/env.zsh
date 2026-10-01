# ~/.config/zsh/modules/env.zsh

# --- PATH base ---
# NOTA: gli override custom (vim, neovim, powershell, .local/bin) sono stati
# spostati in path-overrides.zsh, caricato DOPO mise.zsh per evitare che
# l'export PATH cached di mise li sovrascriva all'avvio della shell.

# --- XDG dirs ---
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_STATE_HOME="$HOME/.local/state"

# --- Chrome DevTools Protocol ---
export CDP_PORT_FILE='E:/msys64/home/Sphynx/.cache/chrome-cdp-profile/DevToolsActivePort'

# --- Ripgrep dirs ---
export RIPGREP_CONFIG_PATH="$HOME/.config/ripgrep/ripgreprc"

# --- Yazi config dir (esplicito, anche se ridondante con XDG_CONFIG_HOME) ---
export YAZI_CONFIG_HOME="$HOME/.config/yazi"

# --- History ---
HISTFILE="$ZSH_CONFIG/.histfile"
HISTSIZE=10000
SAVEHIST=10000
# 10 = 100ms. Con 1 (10ms) il ConPTY di WezTerm non fa in tempo a consegnare
# tutta la sequenza ^[[200~ del paste: zsh la legge come Esc + comandi vi.
KEYTIMEOUT=20
HISTORY_IGNORE="(..|...|c|h|l|l1|p|pwd|gst|gd|exit|* --help)" # Exclude mundane commands.
setopt SHARE_HISTORY
setopt INC_APPEND_HISTORY
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FCNTL_LOCK


# --- MSYS optional toggles ---
# export USERPROFILE="E:/msys64/home/Sphynx"
# Esportata (non solo nell'alias claude) così i processi figli la ereditano:
# es. `ccr code` lancia il binario claude scavalcando l'alias → senza questo
# userebbe la config default (C:\Users) priva di trust Trinity e di OBSIDIAN_*/TRINITY_PLUGIN_DIR
export CLAUDE_CONFIG_DIR="$(cygpath -w "$HOME/.claude")"
# gh (binario Windows nativo) risolve la config in XDG_CONFIG_HOME/gh: con il valore
# POSIX qui sopra ("/e/msys64/...") Windows lo legge come "\e\msys64\..." RELATIVO al
# drive corrente → login "sparso" per drive (D:\e\..., E:\e\...) e "not logged in" nel
# tool Bash di Claude Code (che senza XDG cade su %APPDATA%\GitHub CLI). Path Windows
# assoluto → tutte le shell leggono lo stesso hosts.yml (2026-08-15).
export GH_CONFIG_DIR="$(cygpath -w "$HOME/.config/gh")"
# export MSYS2_ARG_CONV_EXCL='*'
# export MSYS_NO_PATHCONV=1
