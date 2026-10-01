# ~/.config/zsh/modules/mise.zsh
#
# Activate mode con conversione path Windows -> MSYS pure-zsh (no cygpath).
# Le helper _msys_win2unix_path / _msys_win2unix_pathlist restituiscono
# tramite REPLY per evitare sub-shell $(...).

# Converte un singolo path Windows in MSYS/Unix.
# Es: "C:\Users\foo" -> "/c/Users/foo". Scrive in REPLY.
_msys_win2unix_path() {
	emulate -L zsh -o extended_glob
	local p=$1
	p=${p//$'\r'/}        # cleanup CRLF
	p=${p##[[:space:]]##} # trim leading whitespace
	p=${p%%[[:space:]]##} # trim trailing whitespace
	p=${p//\\//}          # backslash -> forward slash
	# Drive letter iniziale "X:/..." -> "/x/..."
	if [[ $p == [A-Za-z]:/* ]]; then
		p="/${(L)p[1]}${p[3,-1]}"
	elif [[ $p == [A-Za-z]: ]]; then
		p="/${(L)p[1]}"
	fi
	REPLY=$p
}

# Converte una PATH list (separata da ; o :) in MSYS/Unix.
# Gestisce mix Windows/Unix proteggendo i drive letter "X:" durante lo split.
# Es: "C:\foo;C:\bar" -> "/c/foo:/c/bar". Scrive in REPLY.
_msys_win2unix_pathlist() {
	emulate -L zsh
	local input=$1
	input=${input//$'\r'/}

	local -a segments
	if [[ $input == *\;* ]]; then
		# PATH list stile Windows: split semplice su ;
		segments=("${(@s/;/)input}")
	else
		# PATH list stile Unix: split su ':' produce segmenti errati per i
		# drive letter (es. "C:/foo" -> ["C", "/foo"]). Identifico i segmenti
		# che sono una singola lettera ASCII e li riunisco al successivo.
		local -a raw=("${(@s/:/)input}")
		local i=1 cur
		while ((i <= ${#raw})); do
			cur=${raw[i]}
			if [[ $cur == [A-Za-z] && $((i + 1)) -le ${#raw} ]]; then
				segments+=("${cur}:${raw[i + 1]}")
				((i += 2))
			else
				segments+=("$cur")
				((i++))
			fi
		done
	fi

	local -a out
	local seg
	for seg in $segments; do
		[[ -z $seg ]] && continue
		_msys_win2unix_path "$seg"
		out+=("$REPLY")
	done
	REPLY="${(j/:/)out}"
}

_msys_setup_mise() {
	emulate -L zsh

	# Layout MSYS locale, non Scoop
	export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$HOME/.local/bin/lua-language-server/bin:$PATH"

	local mise_binary_directory_path="$HOME/.local/bin"
	local mise_binary_path=""

	if [[ -x "$mise_binary_directory_path/mise.exe" ]]; then
		mise_binary_path="$mise_binary_directory_path/mise.exe"
	elif [[ -x "$mise_binary_directory_path/mise" ]]; then
		mise_binary_path="$mise_binary_directory_path/mise"
	elif command -v mise.exe >/dev/null 2>&1; then
		_msys_win2unix_path "$(command -v mise.exe)"
		mise_binary_path=$REPLY
	elif command -v mise >/dev/null 2>&1; then
		mise_binary_path="$(command -v mise)"
	else
		return
	fi

	typeset -g _MISE_EXE_UNIX="$mise_binary_path"

	mise() {
		command "$_MISE_EXE_UNIX" "$@"
	}

	export MISE_EXE="$_MISE_EXE_UNIX"
	export MISE_SHELL=zsh

	local cachedir="${XDG_CACHE_HOME:-$HOME/.cache}/mise/zsh-msys"
	local functions_dir="$cachedir/functions"
	local activatefile="$cachedir/mise-activate.zsh"
	local compfile="$functions_dir/_mise"

	mkdir -p "$cachedir" "$functions_dir"

	# Activation script cacheato
	if [[ ! -e "$activatefile" || "$activatefile" -ot "$_MISE_EXE_UNIX" ]]; then
		local mise_activate_script
		local mise_path_line

		mise_activate_script="$("$_MISE_EXE_UNIX" activate zsh)"
		mise_activate_script="${mise_activate_script//$'\r'/}"

		# Converte la PATH generata da mise in formato MSYS/Unix
		mise_path_line="$(printf '%s\n' "$mise_activate_script" |
			sed -n 's/^export PATH="\([^"]*\)".*$/\1/p')"

		if [[ -n "$mise_path_line" ]]; then
			_msys_win2unix_pathlist "$mise_path_line"
			mise_path_line=$REPLY

			mise_activate_script="$(printf '%s\n' "$mise_activate_script" |
				awk -v newpath="$mise_path_line" '
          BEGIN { done=0 }
          {
            if (!done && $0 ~ /^export PATH=/) {
              print "export PATH=\"" newpath "\""
              done=1
            } else {
              print $0
            }
          }
        ')"
		fi

		# Sostituisce riferimenti Windows tipo C:\...\mise.exe con path Unix
		mise_activate_script="$(printf '%s\n' "$mise_activate_script" |
			sed -E "s@[A-Za-z]:\\\\[^\"']*\\\\mise\.exe@$_MISE_EXE_UNIX@g")"

		print -r -- "$mise_activate_script" >|"$activatefile"
		zcompile -UR "$activatefile" 2>/dev/null
	fi

	source "$activatefile"

	# hook-env senza rischio CRLF
	local mise_hook_env
	mise_hook_env="$("$_MISE_EXE_UNIX" hook-env -s zsh 2>/dev/null)"
	mise_hook_env="${mise_hook_env//$'\r'/}"
	[[ -n "$mise_hook_env" ]] && eval "$mise_hook_env"

	# Completion mise
	if [[ ! -e "$compfile" || "$compfile" -ot "$_MISE_EXE_UNIX" ]]; then
		local mise_completion
		mise_completion="$("$_MISE_EXE_UNIX" complete --shell zsh 2>/dev/null)"
		mise_completion="${mise_completion//$'\r'/}"
		print -r -- "$mise_completion" >|"$compfile"
	fi

	fpath=("$functions_dir" ${fpath:#$functions_dir})

	if (($+functions[compdef])); then
		autoload -Uz _mise
		compdef _mise mise 2>/dev/null
	fi

	# Normalizza PATH dopo mise (pure-zsh, zero spawn)
	__mise_fix_path() {
		_msys_win2unix_pathlist "$PATH"
		[[ -n "$REPLY" ]] && export PATH="$REPLY"
		# Rimuove segmenti spuri prodotti dal parser su drive letter orfani
		path=(${path:#C})
		path=(${path:#})
	}

	# Fix immediato dopo cd, non solo al prompt
	if (($+functions[_mise_hook_chpwd])); then
		if [[ "${functions[_mise_hook_chpwd]}" != *"__mise_fix_path"* ]]; then
			functions[_mise_hook_chpwd_raw]="${functions[_mise_hook_chpwd]}"

			_mise_hook_chpwd() {
				_mise_hook_chpwd_raw "$@"
				__mise_fix_path
			}
		fi
	fi

	autoload -Uz add-zsh-hook
	add-zsh-hook -d precmd __mise_fix_path 2>/dev/null
	add-zsh-hook precmd __mise_fix_path

	__mise_fix_path
}

_msys_setup_mise
unfunction _msys_setup_mise 2>/dev/null
