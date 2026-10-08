#!/bin/bash
# Source: https://github.com/daniel3303/ClaudeCodeStatusLine
# Single line: Model | tokens | %used | %remain | think | 5h bar @reset | 7d bar @reset | extra
#
# Ottimizzato per MSYS2: ogni $( ), pipe o comando esterno crea un processo Windows
# (fork emulato + exec) che l'antivirus scansiona. Con più sessioni Claude Code aperte
# la statusline arrivava a ~70 processi per render e saturava la CPU in kernel.
# Regole di questo file:
# - helper che scrivono in REPLY (printf -v) invece di essere chiamati dentro $( )
# - un solo jq per render (stdin + cache usage via --arg)
# - git branch letto da .git/HEAD; git diff e titolo sessione in cache su file
# - età delle cache da un file .ts con l'epoch (read builtin) invece di stat

set -f # disable globbing
# Force C locale for numeric formatting: on locales that use comma as the decimal
# separator (e.g. it_IT), bash `printf "%.0f"` rejects dot-decimal values like "42.5".
# LC_NUMERIC only affects number parsing/formatting, not UTF-8 output (the … glyph).
export LC_NUMERIC=C
VERSION="1.4.4"

IFS= read -r -d '' input # bash builtin (no subprocess, unlike $(cat))

if [ -z "$input" ]; then
	printf "Claude"
	exit 0
fi

# ANSI colors matching oh-my-posh theme
blue='\033[38;2;0;153;255m'
orange='\033[38;2;255;176;85m'
green='\033[38;2;0;160;0m'
cyan='\033[38;2;46;149;153m'
red='\033[38;2;255;85;85m'
yellow='\033[38;2;230;200;0m'
purple='\033[38;2;167;139;250m'
white='\033[38;2;220;220;220m'
dim='\033[38;2;150;157;171m' # light grey (was \033[2m faint — too dark to read on dark bg)
reset='\033[0m'

printf -v now '%(%s)T' -1 # bash built-in epoch (no subprocess)
state_dir="/tmp/claude"
[ -d "$state_dir" ] || mkdir -p "$state_dir" 2>/dev/null

# Format token counts (e.g., 50k / 200k) into REPLY — pure bash arithmetic
format_tokens() {
	local num=$1 v
	if [ "$num" -ge 1000000 ]; then
		v=$(((num + 50000) / 100000)) # tenths of a million, rounded
		if [ $((v % 10)) -eq 0 ]; then
			REPLY="$((v / 10))m"
		else
			REPLY="$((v / 10)).$((v % 10))m"
		fi
	elif [ "$num" -ge 1000 ]; then
		REPLY="$(((num + 500) / 1000))k"
	else
		REPLY="$num"
	fi
}

# Color escape for a usage percentage into REPLY. Usage: usage_color <pct>
usage_color() {
	local pct=$1
	if [ "$pct" -ge 90 ]; then
		REPLY="$red"
	elif [ "$pct" -ge 70 ]; then
		REPLY="$orange"
	elif [ "$pct" -ge 50 ]; then
		REPLY="$yellow"
	else
		REPLY="$green"
	fi
}

# Convert a Windows path (C:\foo\bar or C:/foo/bar) to an MSYS2 path (/c/foo/bar) into REPLY.
win_to_msys() {
	local p="${1//\\//}" # backslashes → forward slashes
	if [[ "$p" == ?:* ]]; then
		local drive="${p%%:*}" rest="${p#*:}"
		REPLY="/${drive,,}${rest}"
	else
		REPLY="$p"
	fi
}

# Truncate a string to N chars into REPLY, appending … when cut. Usage: truncate_str <str> <max>
truncate_str() {
	local s="$1" max="$2"
	if [ "${#s}" -gt "$max" ]; then
		REPLY="${s:0:max}…"
	else
		REPLY="$s"
	fi
}

# Read the epoch stored in <file>.ts into REPLY (0 when missing). Usage: read_ts <file>
read_ts() {
	REPLY=0
	[ -f "$1.ts" ] && read -r REPLY <"$1.ts"
	[[ "$REPLY" =~ ^[0-9]+$ ]] || REPLY=0
}

# Resolve a session's display name from its transcript .jsonl into REPLY.
# Prefers the last custom-title (set by /rename or the first prompt); falls back
# to the short session id. One grep process; last match picked in bash.
# Usage: sess_title <transcript_path_msys> <session_id>
sess_title() {
	local tpath="$1" sid="$2" title=""
	if [ -f "$tpath" ]; then
		title=$(grep -o '"customTitle":"\([^"\\]\|\\.\)*"' "$tpath" 2>/dev/null)
		title="${title##*$'\n'}"           # last match
		title="${title#\"customTitle\":\"}" # strip key
		title="${title%\"}"
		title="${title//\\\"/\"}" # unescape \" and \\
		title="${title//\\\\/\\}"
	fi
	title="${title% (Branch)}" # strip the suffix Claude Code appends to forked sessions
	if [ -z "$title" ]; then
		title="${sid:0:8}" # fallback: short id for never-renamed sessions
	fi
	REPLY="$title"
}

# Resolve config directory: convert CLAUDE_CONFIG_DIR (Windows backslash path) to MSYS2 forward-slash path
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
	win_to_msys "$CLAUDE_CONFIG_DIR"
	claude_config_dir="$REPLY"
else
	claude_config_dir="$HOME/.claude"
fi

# Return 0 (true) if $1 > $2 using semantic versioning
version_gt() {
	local a="${1#v}" b="${2#v}"
	local IFS='.'
	read -r a1 a2 a3 <<<"$a"
	read -r b1 b2 b3 <<<"$b"
	a1=${a1:-0}
	a2=${a2:-0}
	a3=${a3:-0}
	b1=${b1:-0}
	b2=${b2:-0}
	b3=${b3:-0}
	[ "$a1" -gt "$b1" ] 2>/dev/null && return 0
	[ "$a1" -lt "$b1" ] 2>/dev/null && return 1
	[ "$a2" -gt "$b2" ] 2>/dev/null && return 0
	[ "$a2" -lt "$b2" ] 2>/dev/null && return 1
	[ "$a3" -gt "$b3" ] 2>/dev/null && return 0
	return 1
}

# ===== Usage API cache (shared across all Claude Code instances to avoid rate limits) =====
# Loaded BEFORE the main jq so the same jq call parses it too.
cache_key="${claude_config_dir//[^A-Za-z0-9]/_}" # bash builtin instead of echo|shasum(perl)|cut
cache_file="$state_dir/statusline-usage-cache-${cache_key}.json"
cache_max_age=180 # seconds between API calls

usage_data=""
[ -s "$cache_file" ] && IFS= read -r -d '' usage_data <"$cache_file"
read_ts "$cache_file"
needs_refresh=false
[ $((now - REPLY)) -ge "$cache_max_age" ] && needs_refresh=true

# ===== Extract all data from JSON (single jq call to avoid MSYS2 process-spawn overhead) =====
# Notes:
# - MSYS2 ships jq 1.8.1 which doesn't compile Oniguruma named captures (?<name>...) — the
#   "(1M context)" → "1M" transform is therefore done with bash regex AFTER the eval.
# - On MSYS2, jq emits CRLF line endings; the \r are stripped in bash before eval so
#   `cache_create=0\r` doesn't poison arithmetic with $'0\r'.
# - $u is the usage API cache: parsed here so the fallback/extra_usage paths need no jq.
#   ISO resets_at ("2026-10-08T17:59:59.761922+00:00", always UTC) → epoch via the first 19 chars.
_vars=$(jq -r --arg u "$usage_data" '
  def iso2epoch: if type == "string" and length >= 19 then (try (.[0:19] + "Z" | fromdateiso8601) catch "") else "" end;
  ($u | try fromjson catch {} | if type == "object" then . else {} end) as $U |
  "model_name=" + ((.model.display_name // "Claude") | @sh),
  "model_id=" + ((.model.id // "") | @sh),
  "size=" + ((.context_window.context_window_size // 200000) | tostring),
  "input_tokens=" + ((.context_window.current_usage.input_tokens // 0) | tostring),
  "cache_create=" + ((.context_window.current_usage.cache_creation_input_tokens // 0) | tostring),
  "cache_read=" + ((.context_window.current_usage.cache_read_input_tokens // 0) | tostring),
  "cwd=" + ((.cwd // "") | @sh),
  "transcript_path=" + ((.transcript_path // "") | @sh),
  "session_id=" + ((.session_id // "") | @sh),
  "stdin_effort=" + ((.effort.level // "") | @sh),
  "fast_mode=" + ((.fast_mode // false) | tostring),
  "builtin_five_hour_pct=" + ((.rate_limits.five_hour.used_percentage // "") | tostring),
  "builtin_five_hour_reset=" + ((.rate_limits.five_hour.resets_at // "") | tostring),
  "builtin_seven_day_pct=" + ((.rate_limits.seven_day.used_percentage // "") | tostring),
  "builtin_seven_day_reset=" + ((.rate_limits.seven_day.resets_at // "") | tostring),
  "cache_expires_at=" + (.prompt_cache.expires_at | if type == "number" then floor | tostring else "" end),
  "cache_ttl=" + ((.prompt_cache.ttl // "") | @sh),
  "api_valid=" + (if $U.five_hour != null then "true" else "false" end),
  "api_five_hour_pct=" + (($U.five_hour.utilization // 0) | round | tostring),
  "api_five_hour_reset=" + ($U.five_hour.resets_at | iso2epoch | tostring),
  "api_seven_day_pct=" + (($U.seven_day.utilization // 0) | round | tostring),
  "api_seven_day_reset=" + ($U.seven_day.resets_at | iso2epoch | tostring),
  "extra_enabled=" + (($U.extra_usage.is_enabled // false) | tostring),
  "extra_pct=" + (($U.extra_usage.utilization // 0) | round | tostring),
  "extra_used=" + ((($U.extra_usage.used_credits // 0) / 100) | tostring),
  "extra_limit=" + ((($U.extra_usage.monthly_limit // 0) / 100) | tostring)
' <<<"$input" 2>/dev/null)
eval "${_vars//$'\r'/}"
unset _vars
# "Claude Sonnet 4.6 (1M context)" → "Claude Sonnet 4.6 1M" (bash builtin BASH_REMATCH, no subprocess)
if [[ "$model_name" =~ \ *\(([0-9.]*[kKmM]*)\ context\) ]]; then
	model_name="${model_name/${BASH_REMATCH[0]}/ ${BASH_REMATCH[1]}}"
fi
[ -z "$size" ] && size=200000
[ "$size" -eq 0 ] 2>/dev/null && size=200000

# ── Context window override per gateway models (Claude Code non conosce questi model ID) ──
# La size di default (200k o quella del JSON) viene sovrascritta in base al model_id.
# Pattern match case-insensitive sull'ID modello; l'ordine è dal più specifico al generico.
model_lower="${model_id,,}"  # lowercase per confronto case-insensitive
case "$model_lower" in
  # ── Modelli Claude con 1M context abilitato ([1m] nel model id) ──
  *'[1m]'*)                  size=1000000 ;;
  # ── GPT-5 via LiteLLM ──
  *gpt-5.6-sol*|*gpt-5-6-sol*) size=370000 ;;
  *gpt-5.5*|*gpt-5-5*)       size=1000000 ;;
  *gpt-5.3*|*gpt-5-3*)       size=1000000 ;;
  *gpt-5.4*|*gpt-5-4*)       size=1000000 ;;
  # ── DeepSeek V4 (1M input, 384K output) ──
  *deepseek-v4*)             size=1000000 ;;
  *deepseek*v4*)             size=1000000 ;;
  # ── Modello non riconosciuto: resta il fallback (200k o size da JSON) ──
esac
unset model_lower

: "${input_tokens:=0}"
: "${cache_create:=0}"
: "${cache_read:=0}"
current=$((input_tokens + cache_create + cache_read))

format_tokens "$current"
used_tokens="$REPLY"
format_tokens "$size"
total_tokens="$REPLY"

if [ "$size" -gt 0 ]; then
	pct_used=$((current * 100 / size))
else
	pct_used=0
fi

# Check reasoning effort — cache result to avoid jq subprocess on every render
settings_path="$claude_config_dir/settings.json"
_effort_cache="$state_dir/effort-level-cache.txt"
effort_level=""
if [ -n "$stdin_effort" ]; then
	effort_level="$stdin_effort"
elif [ -n "$CLAUDE_CODE_EFFORT_LEVEL" ]; then
	effort_level="$CLAUDE_CODE_EFFORT_LEVEL"
elif [ -f "$settings_path" ]; then
	if [ -f "$_effort_cache" ] && [ "$_effort_cache" -nt "$settings_path" ]; then
		read -r effort_level <"$_effort_cache"
	else
		effort_val=$(jq -r '.effortLevel // empty' "$settings_path" 2>/dev/null)
		effort_val="${effort_val//$'\r'/}"
		effort_level="${effort_val:-medium}"
		echo "$effort_level" >"$_effort_cache"
	fi
fi
[ -z "$effort_level" ] && effort_level="medium"

# ===== Build single-line output =====
out=""

# ===== Ponytail mode badge =====
ponytail_flag="${claude_config_dir}/.ponytail-active"
if [ -f "$ponytail_flag" ]; then
	p_mode=""
	read -r p_mode <"$ponytail_flag"
	p_mode="${p_mode//[[:space:]]/}"
	if [ -n "$p_mode" ] && [ "$p_mode" != "off" ]; then
		if [ "$p_mode" = "full" ]; then
			p_badge="[PONYTAIL]"
		else
			p_badge="[PONYTAIL:${p_mode^^}]"
		fi
		out+="${green}${p_badge}${reset} ${dim}|${reset} "
	fi
fi
out+="${blue}${model_name}${reset} "
case "$effort_level" in
low) out+="${dim}Low${reset}" ;;
medium) out+="${orange}Medium${reset}" ;;
high) out+="${green}High${reset}" ;;
xhigh) out+="${purple}XHigh${reset}" ;;
max) out+="${red}Max${reset}" ;;
*) out+="${green}${effort_level^}${reset}" ;;
esac
[ "$fast_mode" = "true" ] && out+=" ${yellow}⚡${reset}"

# Current working directory (cwd already extracted in main jq eval above)
cwd="${cwd//\\/\/}" # Normalize Windows backslashes to forward slashes (bash built-in, no subprocess)
if [ -n "$cwd" ]; then
	display_dir="${cwd##*/}"
	out+=" ${dim}|${reset} "
	out+="${cyan}${display_dir}${reset}"
	git_branch=""
	git_root="$cwd" # walk up to the dir holding .git, so subdirs of a repo/worktree show the branch too
	while [ -n "$git_root" ] && [ ! -e "$git_root/.git" ]; do
		[ "$git_root" = "${git_root%/*}" ] && git_root="" || git_root="${git_root%/*}"
	done
	if [ -n "$git_root" ]; then
		# Branch from HEAD without a git process. Worktrees have a .git FILE ("gitdir: <path>").
		git_dir="$git_root/.git"
		if [ -f "$git_dir" ]; then
			_line=""
			read -r _line <"$git_dir"
			_line="${_line#gitdir: }"
			_line="${_line%$'\r'}"
			if [[ "$_line" == /* || "$_line" == ?:* ]]; then
				win_to_msys "$_line"
				git_dir="$REPLY"
			else
				git_dir="$git_root/$_line"
			fi
		fi
		_head=""
		[ -f "$git_dir/HEAD" ] && read -r _head <"$git_dir/HEAD"
		_head="${_head%$'\r'}"
		if [[ "$_head" == "ref: refs/heads/"* ]]; then
			git_branch="${_head#ref: refs/heads/}"
		elif [ -n "$_head" ]; then
			git_branch="HEAD" # detached, same text as `git rev-parse --abbrev-ref HEAD`
		fi
	fi
	if [ -n "$git_branch" ]; then
		out+="${dim}@${reset}${green}${git_branch}${reset}"
		# Diff stat cached per repo root (git diff walks the whole tree — too costly per render)
		gs_file="$state_dir/statusline-gitstat-${git_root//[^A-Za-z0-9]/_}.txt"
		read_ts "$gs_file"
		git_stat=""
		if [ $((now - REPLY)) -ge 15 ]; then
			printf '%s\n' "$now" >"$gs_file.ts"
			_short=$(git -C "${cwd}" diff --shortstat 2>/dev/null)
			_add=0 _del=0
			[[ "$_short" =~ ([0-9]+)\ insertion ]] && _add="${BASH_REMATCH[1]}"
			[[ "$_short" =~ ([0-9]+)\ deletion ]] && _del="${BASH_REMATCH[1]}"
			[ $((_add + _del)) -gt 0 ] && git_stat="+${_add} -${_del}"
			printf '%s' "$git_stat" >"$gs_file"
		elif [ -f "$gs_file" ]; then
			read -r git_stat <"$gs_file"
		fi
		[ -n "$git_stat" ] && out+=" ${dim}(${reset}${green}${git_stat%% *}${reset} ${red}${git_stat##* }${reset}${dim})${reset}"
	fi
fi

# ===== Session segment (name + branch indicator) =====
# Resolve the active transcript: prefer transcript_path from stdin, else derive from
# the projects dir + session id (project hash = cwd with \ / : replaced by -).
transcript_msys=""
if [ -n "$transcript_path" ]; then
	win_to_msys "$transcript_path"
	transcript_msys="$REPLY"
fi
if [ ! -f "$transcript_msys" ] && [ -n "$session_id" ] && [ -n "$cwd" ]; then
	proj_hash="${cwd//[\/:]/-}"
	transcript_msys="${claude_config_dir}/projects/${proj_hash}/${session_id}.jsonl"
fi

if [ -f "$transcript_msys" ]; then
	# Titles cached per session for 60s: the transcript grows to MBs and the title rarely changes.
	# Cache layout: line 1 forked_from, line 2 current title, line 3 parent title.
	st_file="$state_dir/statusline-session-${session_id:-${transcript_msys//[^A-Za-z0-9]/_}}.txt"
	read_ts "$st_file"
	forked_from="" cur_title="" parent_title=""
	if [ $((now - REPLY)) -ge 60 ] || [ ! -f "$st_file" ]; then
		# A forked (branch) session records its origin in forkedFrom.sessionId on line 1.
		_first=""
		read -r _first <"$transcript_msys"
		[[ "$_first" =~ \"forkedFrom\":\{[^}]*\"sessionId\":\"([^\"]+)\" ]] && forked_from="${BASH_REMATCH[1]}"
		sess_title "$transcript_msys" "$session_id"
		cur_title="$REPLY"
		if [ -n "$forked_from" ]; then
			# Parent transcript lives in the same dir.
			sess_title "${transcript_msys%/*}/${forked_from}.jsonl" "$forked_from"
			parent_title="$REPLY"
		fi
		printf '%s\n%s\n%s\n' "$forked_from" "$cur_title" "$parent_title" >"$st_file"
		printf '%s\n' "$now" >"$st_file.ts"
	else
		{
			read -r forked_from
			read -r cur_title
			read -r parent_title
		} <"$st_file"
	fi

	out+=" ${dim}|${reset} "
	if [ -n "$forked_from" ]; then
		truncate_str "$parent_title" 22
		out+="${purple}Session:${reset} ${white}${REPLY}${reset}"
		truncate_str "$cur_title" 22
		out+="${dim} › ${reset}${green}${REPLY}${reset}"
	else
		truncate_str "$cur_title" 30
		out+="${purple}Session:${reset} ${white}${REPLY}${reset}"
	fi
fi

out+=" ${dim}|${reset} "
out+="${orange}${used_tokens}/${total_tokens}${reset} ${dim}(${reset}${green}${pct_used}%${reset}${dim})${reset}"

# ===== Cache performance (letture vs scritture su questo turno) =====
# cache_read   = token serviti dalla cache, fatturati ~10% dell'input standard
# cache_create = token scritti in cache ora, fatturati a tariffa di scrittura
# Ratio alto = prefisso stabile, caching efficace. Se create resta alto turno
# dopo turno, qualcosa sta invalidando il prefisso.
cache_total=$((cache_read + cache_create))
if [ "$cache_total" -gt 0 ]; then
	hit_pct=$((cache_read * 100 / cache_total))
	if [ "$hit_pct" -ge 90 ]; then
		hit_color="$green"
	elif [ "$hit_pct" -ge 70 ]; then
		hit_color="$yellow"
	else
		hit_color="$red"
	fi
	format_tokens "$cache_read"
	_cr="$REPLY"
	format_tokens "$cache_create"
	_cc="$REPLY"
	out+=" ${dim}|${reset} "
	out+="${dim}cache${reset} ${cyan}${_cr}↓${reset}${dim}/${reset}${purple}${_cc}↑${reset} ${dim}(${reset}${hit_color}${hit_pct}%${reset}${dim})${reset}"
	# TTL residuo: prompt_cache.expires_at dal JSON di stdin (Claude Code >= 2.1.251).
	# Ogni richiesta rinnova la scadenza; null quando l'ultima risposta non aveva token in cache.
	if [ -n "$cache_expires_at" ]; then
		[ "$cache_ttl" = "1h" ] && ttl=3600 || ttl=300
		ttl_left=$((cache_expires_at - now))
		if [ "$ttl_left" -le 0 ]; then
			out+=" ${red}⏳scaduta${reset}"
		else
			if [ "$ttl_left" -gt $((ttl / 2)) ]; then ttl_color="$green"
			elif [ "$ttl_left" -gt $((ttl / 5)) ]; then ttl_color="$yellow"
			else ttl_color="$red"; fi
			[ "$ttl_left" -ge 60 ] && ttl_txt="$((ttl_left / 60))m" || ttl_txt="${ttl_left}s"
			out+=" ${ttl_color}⏳${ttl_txt}${reset}"
		fi
	fi
fi

# ===== Cross-platform OAuth token resolution (from statusline.sh) =====
# Tries credential sources in order: env var → macOS Keychain → Linux creds file → GNOME Keyring
# Runs only inside the async refresh subshell (at most once per cache_max_age).
get_oauth_token() {
	local token=""

	# 1. Explicit env var override
	if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
		echo "$CLAUDE_CODE_OAUTH_TOKEN"
		return 0
	fi

	# 2. macOS Keychain (Claude Code appends a SHA256 hash of CLAUDE_CONFIG_DIR to the service name)
	if command -v security >/dev/null 2>&1; then
		local keychain_svc="Claude Code-credentials"
		if [ -n "$CLAUDE_CONFIG_DIR" ]; then
			local dir_hash
			dir_hash=$(echo -n "$CLAUDE_CONFIG_DIR" | shasum -a 256 | cut -c1-8)
			keychain_svc="Claude Code-credentials-${dir_hash}"
		fi
		local blob
		blob=$(security find-generic-password -s "$keychain_svc" -w 2>/dev/null)
		if [ -n "$blob" ]; then
			token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
			if [ -n "$token" ] && [ "$token" != "null" ]; then
				echo "$token"
				return 0
			fi
		fi
	fi

	# 3. Linux credentials file
	local creds_file="${claude_config_dir}/.credentials.json"
	if [ -f "$creds_file" ]; then
		token=$(jq -r '.claudeAiOauth.accessToken // empty' "$creds_file" 2>/dev/null)
		if [ -n "$token" ] && [ "$token" != "null" ]; then
			echo "$token"
			return 0
		fi
	fi

	# 4. GNOME Keyring via secret-tool
	if command -v secret-tool >/dev/null 2>&1; then
		local blob
		blob=$(timeout 2 secret-tool lookup service "Claude Code-credentials" 2>/dev/null)
		if [ -n "$blob" ]; then
			token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
			if [ -n "$token" ] && [ "$token" != "null" ]; then
				echo "$token"
				return 0
			fi
		fi
	fi

	echo ""
}

# ===== LINE 2 & 3: Usage limits with progress bars =====
# First, try to use rate_limits data provided directly by Claude Code in the JSON input.
# This is the most reliable source — no OAuth token or API call required.
# (builtin_five_hour_pct/reset and builtin_seven_day_pct/reset already set by the single jq eval above)

use_builtin=false
if [ -n "$builtin_five_hour_pct" ] || [ -n "$builtin_seven_day_pct" ]; then
	use_builtin=true
fi

# When builtin values are all zero AND reset timestamps are missing, it likely indicates
# an API failure on Claude's side — fall through to cached data instead of displaying
# misleading 0%. Genuine zero responses (after a billing reset) still include valid
# resets_at timestamps, so we trust those.
effective_builtin=false
if $use_builtin; then
	# Trust builtin if any percentage is non-zero
	_p5=0 _p7=0
	[ -n "$builtin_five_hour_pct" ] && printf -v _p5 '%.0f' "$builtin_five_hour_pct" 2>/dev/null
	[ -n "$builtin_seven_day_pct" ] && printf -v _p7 '%.0f' "$builtin_seven_day_pct" 2>/dev/null
	if [ "$_p5" != "0" ] || [ "$_p7" != "0" ]; then
		effective_builtin=true
	fi
	# Also trust if reset timestamps are present — genuine zero responses include valid reset times
	if ! $effective_builtin; then
		if { [ -n "$builtin_five_hour_reset" ] && [ "$builtin_five_hour_reset" != "null" ] && [ "$builtin_five_hour_reset" != "0" ]; } ||
			{ [ -n "$builtin_seven_day_reset" ] && [ "$builtin_seven_day_reset" != "null" ] && [ "$builtin_seven_day_reset" != "0" ]; }; then
			effective_builtin=true
		fi
	fi
fi

# Refresh API cache when stale — runs regardless of builtin rate_limits because
# extra_usage is only exposed through the OAuth usage endpoint (not stdin JSON).
# Throttled to cache_max_age and stampede-locked via the .ts file for shared panes.
if $needs_refresh; then
	printf '%s\n' "$now" >"$cache_file.ts" # stampede lock: prevent parallel panes from fetching simultaneously
	# Fetch asynchronously so the statusline renders immediately from cached data.
	# The fresh response lands in the cache for the next render — no blocking on curl.
	(
		_token=$(get_oauth_token)
		if [ -n "$_token" ] && [ "$_token" != "null" ]; then
			_resp=$(curl -s --max-time 10 \
				-H "Accept: application/json" \
				-H "Content-Type: application/json" \
				-H "Authorization: Bearer $_token" \
				-H "anthropic-beta: oauth-2025-04-20" \
				-H "User-Agent: claude-code/2.1.34" \
				"https://api.anthropic.com/api/oauth/usage" 2>/dev/null)
			if [[ "$_resp" == *'"five_hour"'* ]]; then
				printf '%s\n' "$_resp" >"$cache_file"
			fi
		fi
	) >/dev/null 2>&1 &
	disown $! 2>/dev/null
fi

sep=" ${dim}|${reset} "

# Render extra_usage segment from API usage data (not available via stdin rate_limits).
# Appends to the global $out. No-op when data is missing or is_enabled is false.
# Values already parsed by the main jq (extra_*).
render_extra_usage() {
	[ "$extra_enabled" != "true" ] && return
	local used limit
	if printf -v used '%.2f' "$extra_used" 2>/dev/null && printf -v limit '%.2f' "$extra_limit" 2>/dev/null; then
		usage_color "${extra_pct:-0}"
		out+="${sep}${white}extra${reset} ${REPLY}\$${used}/\$${limit}${reset}"
	else
		out+="${sep}${white}extra${reset} ${green}enabled${reset}"
	fi
}

if $effective_builtin; then
	# ---- Use rate_limits data provided directly by Claude Code in JSON input ----
	# resets_at values are Unix epoch integers in this source
	if [ -n "$builtin_five_hour_pct" ]; then
		printf -v five_hour_pct "%.0f" "$builtin_five_hour_pct"
		usage_color "$five_hour_pct"
		out+="${sep}${white}5h${reset} ${REPLY}${five_hour_pct}%${reset}"
		if [ -n "$builtin_five_hour_reset" ] && [ "$builtin_five_hour_reset" != "null" ]; then
			printf -v five_hour_reset "%(%H:%M)T" "$builtin_five_hour_reset"
			[ -n "$five_hour_reset" ] && out+=" ${dim}@${five_hour_reset}${reset}"
		fi
	fi

	if [ -n "$builtin_seven_day_pct" ]; then
		printf -v seven_day_pct "%.0f" "$builtin_seven_day_pct"
		usage_color "$seven_day_pct"
		out+="${sep}${white}7d${reset} ${REPLY}${seven_day_pct}%${reset}"
		if [ -n "$builtin_seven_day_reset" ] && [ "$builtin_seven_day_reset" != "null" ]; then
			printf -v seven_day_reset "%(%b %e, %H:%M)T" "$builtin_seven_day_reset"
			seven_day_reset="${seven_day_reset//  / }" # normalize "May  8" → "May 8" for single-digit days
			[ -n "$seven_day_reset" ] && out+=" ${dim}@${seven_day_reset}${reset}"
		fi
	fi

	# Render extra_usage from API cache (stdin rate_limits doesn't expose it)
	render_extra_usage
	# Cache update omitted: the async background API fetch maintains the cache file,
	# including extra_usage. Writing incomplete builtin data here would overwrite it.
elif [ "$api_valid" = "true" ]; then
	# ---- Fall back: API-fetched usage data (parsed by the main jq; resets already epoch) ----
	usage_color "$api_five_hour_pct"
	out+="${sep}${white}5h${reset} ${REPLY}${api_five_hour_pct}%${reset}"
	if [ -n "$api_five_hour_reset" ]; then
		printf -v five_hour_reset "%(%H:%M)T" "$api_five_hour_reset"
		out+=" ${dim}@${five_hour_reset}${reset}"
	fi

	usage_color "$api_seven_day_pct"
	out+="${sep}${white}7d${reset} ${REPLY}${api_seven_day_pct}%${reset}"
	if [ -n "$api_seven_day_reset" ]; then
		printf -v seven_day_reset "%(%b %e, %H:%M)T" "$api_seven_day_reset"
		seven_day_reset="${seven_day_reset//  / }"
		out+=" ${dim}@${seven_day_reset}${reset}"
	fi

	render_extra_usage
else
	# No valid usage data — show placeholders
	out+="${sep}${white}5h${reset} ${dim}-${reset}"
	out+="${sep}${white}7d${reset} ${dim}-${reset}"
fi

# ===== Update check (cached, 24h TTL) =====
version_cache_file="$state_dir/statusline-version-cache.json"
version_cache_max_age=86400 # 24 hours

version_data=""
[ -s "$version_cache_file" ] && IFS= read -r -d '' version_data <"$version_cache_file"
read_ts "$version_cache_file"
if [ $((now - REPLY)) -ge "$version_cache_max_age" ]; then
	printf '%s\n' "$now" >"$version_cache_file.ts"
	# Fetch asynchronously — version data is non-critical and can lag one render.
	(
		_vc=$(curl -s --max-time 5 \
			-H "Accept: application/vnd.github+json" \
			"https://api.github.com/repos/daniel3303/ClaudeCodeStatusLine/releases/latest" 2>/dev/null)
		if [[ "$_vc" == *'"tag_name"'* ]]; then
			printf '%s\n' "$_vc" >"$version_cache_file"
		fi
	) >/dev/null 2>&1 &
	disown $! 2>/dev/null
fi

update_line=""
if [[ "$version_data" =~ \"tag_name\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
	latest_tag="${BASH_REMATCH[1]}"
	if version_gt "$latest_tag" "$VERSION"; then
		update_line="\n${dim}Update available: ${latest_tag} → Tell Claude: \"Find my installed status bar and update it\"${reset}"
	fi
fi

# Output
printf "%b" "$out$update_line"

exit 0
