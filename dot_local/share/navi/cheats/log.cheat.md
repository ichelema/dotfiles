% log

# Monitora log SSH, Caddy e fail2ban con lnav (VPS)
; slnav  lnav come root, dentro tmux se sei in zellij (funzione in ~/.config/zsh/.zshrc)
; -e  esegue un comando e legge il suo output come log
; journalctl -u sshd -f  log di sshd in diretta
; -o short-iso  timestamp ISO, che lnav riconosce
; /var/log/caddy/  access log dei siti
```sh
slnav -e 'journalctl -u sshd -f -o short-iso' /var/log/caddy/ /var/log/fail2ban.log
```
