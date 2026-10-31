% git, remoto

# Fetch e mostra i commit remoti che non ho in locale
```sh
if ! git fetch --quiet; then
  echo "git fetch fallito"
elif ! up=$(git rev-parse --abbrev-ref @{u} 2>/dev/null); then
  echo "Il branch non ha un upstream"
elif [ "$(git rev-list --count HEAD..@{u})" -gt 0 ]; then
  echo "$(git rev-list --count HEAD..@{u}) commit su $up non ancora in locale:"
  git log --oneline --graph HEAD..@{u}
else
  echo "Già aggiornato con $up"
fi
```

# Fetch e conta i commit avanti/indietro
```sh
git fetch --quiet && git rev-list --left-right --count HEAD...@{u} | awk '{print "avanti (solo locali): " $1 "\nindietro (solo remoti): " $2}'
```

# Fetch e mostra i diff
```sh
git fetch --quiet && git diff --stat HEAD...@{u}
```

% git

# Stato sintetico con branch e avanti/indietro
```sh
git status -sb
```

# Storia compatta a grafo (ultimi 20 commit, tutti i branch)
```sh
git log --oneline --graph --decorate --all -20
```

# Passa a un altro branch
```sh
git switch <branch>
```

# Crea un nuovo branch e passaci
```sh
git switch -c <nuovo_branch>
```

# Scarica i commit nuovi dal remoto e poi rimette i commit locali sopra quelli, invece di creare un commit di unione.
```sh
git pull --rebase
```

# Mostra le modifiche già in stage
```sh
git diff --staged
```

# Annulla le modifiche non salvate di un file (irreversibile)
```sh
git restore <file_modificato>
```

# Togli un file dallo stage (le modifiche restano)
```sh
git restore --staged <file_in_stage>
```

# Aggiungi le modifiche in stage all'ultimo commit senza cambiare messaggio
```sh
git commit --amend --no-edit
```

# Annulla l'ultimo commit tenendo le modifiche in stage
```sh
git reset --soft HEAD~1
```

# Metti da parte le modifiche, anche i file nuovi (stash)
```sh
git stash push -u -m "<messaggio>"
```

# Recupera uno stash e toglilo dalla lista
```sh
git stash pop <stash>
```

$ branch: git branch --format='%(refname:short)'
$ file_modificato: git diff --name-only
$ file_in_stage: git diff --name-only --cached
$ stash: git stash list --- --column 1 --delimiter ':'
