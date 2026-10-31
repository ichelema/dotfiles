% chezmoi, dotfiles

# Differenze tra il sorgente e i file reali
```sh
chezmoi diff
```

# Differenze di un solo file
```sh
chezmoi diff <file_gestito>
```

# File che chezmoi cambierebbe con apply
```sh
chezmoi status
```

# Applica un solo file
```sh
chezmoi apply <file_gestito>
```

# Riporta nel sorgente le modifiche fatte a mano su un file
```sh
chezmoi re-add <file_gestito>
```

# Aggiungi un nuovo file a chezmoi
```sh
chezmoi add <file_nuovo>
```

# Modifica il sorgente di un file e applicalo
```sh
chezmoi edit --apply <file_gestito>
```

# Scarica le modifiche dal repository e applicale
```sh
chezmoi update
```

# Ultimi commit del repository dei dotfile
```sh
chezmoi git -- log --oneline -15
```

$ file_gestito: chezmoi managed --include=files --path-style=absolute
$ file_nuovo: fd -H -t f -d 3 . "$HOME/.config"

% mise

# Tool installati e versioni attive
```sh
mise ls
```

# Tool con aggiornamenti disponibili
```sh
mise outdated
```

# Aggiorna i tool alle ultime versioni consentite
```sh
mise upgrade
```

# Imposta la versione globale di un tool
```sh
mise use -g <tool>@<versione>
```

# Versioni disponibili di un tool
```sh
mise ls-remote <tool>
```

# Elimina le versioni non più usate
```sh
mise prune
```

# Lancia un task del progetto
```sh
mise run <task>
```

# Autorizza il mise.toml della cartella corrente
```sh
mise trust
```

# Diagnostica della configurazione
```sh
mise doctor
```

$ tool: mise ls | awk '{print $1}' | sort -u
$ versione: printf 'latest\n'; mise ls-remote <tool> | sort -rV
$ task: mise tasks --no-header | awk '{print $1}'
