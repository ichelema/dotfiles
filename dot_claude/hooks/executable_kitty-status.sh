#!/usr/bin/env bash
# Titolo del tab kitty (nome del repository, OSC 2) e stato di Claude Code (program status, OSC 7501),
# chiamato dagli hook di ~/.claude/settings.json. Con CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 Claude Code
# non scrive né titolo né stato: li scrive questo script, e kitty mostra lo stato con {tab.program_status}.
# $1 = working | permission | question | done | error; vuoto = solo titolo.
# Fuori da kitty non fa nulla; via SSH (TERM=xterm-kitty) le sequenze arrivano al kitty locale.
[ -n "$KITTY_WINDOW_ID" ] || [ "$TERM" = xterm-kitty ] || exit 0

case $1 in
  working)    status='state=working' ;;
  permission) status='state=blocked:kind=permission' ;;
  question)   status='state=blocked:kind=question' ;;
  done)       status='state=done' ;;
  error)      status='state=error' ;;
  *)          status= ;;
esac

# Nome: repo di origin (https://host/user/repo o git@host:user/repo), poi la cartella
url=$(git remote get-url origin 2>/dev/null)
url=${url%/}
url=${url%.git}
name=${url##*[/:]}
[ -n "$name" ] || name=$(basename "$PWD")

# Claude Code avvia gli hook senza terminale di controllo (/dev/tty non si apre):
# risale i processi fino al primo con un TTY (il processo claude) e scrive su quel /dev/pts/N
pid=$$ tty=
while [ "${pid:-0}" -gt 1 ]; do
  read -r tty pid < <(ps -o tty=,ppid= -p "$pid")
  [ -n "$tty" ] && [ "$tty" != "?" ] && break
  tty=
done
# Nessun TTY tra gli antenati (cron, CI, IDE): esce senza scrivere
[ -n "$tty" ] || exit 0
{
  printf '\e]2;%s\a' "$name"
  [ -z "$status" ] || printf '\e]7501;%s:app=claude\a' "$status"
} 2>/dev/null >"/dev/$tty"
exit 0
