#!/usr/bin/env bash
# Nome del repository nel titolo del tab kitty (OSC 2), chiamato dagli hook di ~/.claude/settings.json.
# Fuori da kitty non fa nulla.
[ -n "$KITTY_WINDOW_ID" ] || exit 0

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
printf '\e]2;%s\a' "$name" 2>/dev/null >"/dev/$tty"
exit 0
