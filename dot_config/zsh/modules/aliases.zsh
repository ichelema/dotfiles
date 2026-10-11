# ~/.config/zsh/modules/aliases.zsh

# --- Claude ---
alias claude='env HOME="$(cygpath -w "$HOME")" USERPROFILE="$(cygpath -w "$HOME")" CLAUDE_CONFIG_DIR="$(cygpath -w "$HOME/.claude")" claude --system-prompt-file "$(cygpath -w "$HOME/.claude/system-prompt.md")" --disallowedTools="DesignSync,NotebookEdit,PowerShell,Artifact,ArtifactComments,ArtifactData,ArtifactCheck,SendFeedback"'

# --- Base aliases ---
alias ll='ls -lah --color=auto'
alias la='ls -A --color=auto'
alias grep='grep --color=auto'
alias cls='clear'
alias ..='cd ..'
alias ...='cd ../..'

# --- Better ls: eza ---
if command -v eza >/dev/null 2>&1; then
  alias l='eza --icons=auto --group-directories-first --oneline'
  alias lh='eza --icons=auto --group-directories-first --oneline -a'
  alias lt='eza --icons=auto --tree --level=2 --group-directories-first -a'
else
  alias ls='ls --color=auto'
  alias ll='ls -A --color=auto'
  alias la='ls -A --color=auto'
  alias lt='tree -C -a -L 2'
fi

# --- updatedb: include MSYS2 root and C:\Desktop, cross-filesystem ---
alias updatedb='updatedb --localpaths="/ /d/AI/Claude/Trinity" --prunepaths="/tmp /var/tmp /proc /dev /home/Sphynx/.local/share/nvim/undo /home/Sphynx/.local/share/nvim/view /home/Sphynx/vimfiles/files/undo /home/Sphynx/vimfiles/files/view"'

# --- notebooklm (Google NotebookLM CLI, exe-free, proxy Eni) ---
alias notebooklm='/e/AI/tools/notebooklm-data/notebooklm'
