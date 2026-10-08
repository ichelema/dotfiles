#!/bin/bash
# Source: https://github.com/daniel3303/ClaudeCodeStatusLine
# Single line: Model | tokens | %used | %remain | think | 5h bar @reset | 7d bar @reset | extra

set -f # disable globbing
# Force C locale for numeric formatting: on locales that use comma as the decimal
# separator (e.g. it_IT), bash `printf "%.0f"` rejects dot-decimal values like "42.5".
# LC_NUMERIC only affects number parsing/formatting, not UTF-8 output (the … glyph).
export LC_NUMERIC=C
VERSION="1.4.4"

input=$(cat)

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

# Format token counts (e.g., 50k / 200k)
format_tokens() {
	local num=$1
	if [ "$num" -ge 1000000 ]; then
		awk "BEGIN {v=sprintf(\"%.1f\",$num/1000000)+0; if(v==int(v)) printf \"%dm\",v; else printf \"%.1fm\",v}"
	elif [ "$num" -ge 1000 ]; then
		awk "BEGIN {printf \"%.0fk\", $num / 1000}"
	else
		printf "%d" "$num"
	fi
}

# Format number with commas (e.g., 134,938)
format_commas() {
	printf "%'d" "$1"
}

# Return color escape based on usage percentage
# Usage: usage_color <pct>
usage_color() {
	local pct=$1
	if [ "$pct" -ge 90 ]; then
		echo "$red"
	elif [ "$pct" -ge 70 ]; then
		echo "$orange"
	elif [ "$pct" -ge 50 ]; then
		echo "$yellow"
	else
		echo "$green"
	fi
}

# Convert a Windows path (C:\foo\bar or C:/foo/bar) to an MSYS2 path (/c/foo/bar).
win_to_msys() {
	local p
	p=$(printf '%s' "$1" | tr '\\' '/') # backslashes → forward slashes
	if [[ "$p" == ?:* ]]; then
		local drive="${p%%:*}" rest="${p#*:}"
		printf '/%s%s' "${drive,,}" "$rest"
	else
		printf '%s' "$p"
	fi
}

# Truncate a string to N chars, appending … when cut. Usage: truncate_str <str> <max>
truncate_str() {
	local s="$1" max="$2"
	if [ "${#s}" -gt "$max" ]; then
		printf '%s…' "${s:0:max}"
	else
		printf '%s' "$s"
	fi
}

# Resolve a session's display name from its transcript .jsonl.
# Prefers the last custom-title (set by /rename or the first prompt); falls back
# to the short session id. Usage: sess_title <transcript_path_msys> <session_id>
sess_title() {
	local tpath="$1" sid="$2" title=""
	if [ -f "$tpath" ]; then
		# grep the whole file (custom-title may not be near the tail) then jq the one line
		title=$(grep '"type":"custom-title"' "$tpath" 2>/dev/null | tail -1 |
			jq -r '.customTitle // empty' 2>/dev/null)
	fi
	title="${title% (Branch)}" # strip the suffix Claude Code appends to forked sessions
	if [ -z "$title" ]; then
		title="${sid:0:8}" # fallback: short id for never-renamed sessions
	fi
	printf '%s' "$title"
}

# Resolve config directory: convert CLAUDE_CONFIG_DIR (Windows backslash path) to MSYS2 forward-slash path
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
	_tmp=$(printf '%s' "$CLAUDE_CONFIG_DIR" | tr '\\' '/') # backslashes → forward slashes
	if [[ "$_tmp" == ?:* ]]; then
		_drive="${_tmp%%:*}"                     # extract drive letter
		_rest="${_tmp#*:}"                       # path after the colon
		claude_config_dir="/${_drive,,}${_rest}" # /c/msys64/home/...
	else
		claude_config_dir="$_tmp"
	fi
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
# ===== Extract all data from JSON (single jq call to avoid MSYS2 process-spawn overhead) =====
# Notes:
# - MSYS2 ships jq 1.8.1 which doesn't compile Oniguruma named captures (?<name>...) — the
#   "(1M context)" → "1M" transform is therefore done with bash regex AFTER the eval.
# - On MSYS2, jq emits CRLF line endings; tr -d '\r' strips them so `cache_create=0\r` doesn't
#   poison arithmetic with $'0\r'.
eval "$(echo "$input" | jq -r '
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
  "cache_ttl=" + ((.prompt_cache.ttl // "") | @sh)
' 2>/dev/null | tr -d '\r')"
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

used_tokens=$(format_tokens $current)
total_tokens=$(format_tokens $size)

if [ "$size" -gt 0 ]; then
	pct_used=$((current * 100 / size))
else
	pct_used=0
fi
pct_remain=$((100 - pct_used))

used_comma=$(format_commas $current)
remain_comma=$(format_commas $((size - current)))

# Check reasoning effort — cache result to avoid jq subprocess on every render
settings_path="$claude_config_dir/settings.json"
_effort_cache="/tmp/claude/effort-level-cache.txt"
mkdir -p /tmp/claude 2>/dev/null
effort_level=""
if [ -n "$stdin_effort" ]; then
	effort_level="$stdin_effort"
elif [ -n "$CLAUDE_CODE_EFFORT_LEVEL" ]; then
	effort_level="$CLAUDE_CODE_EFFORT_LEVEL"
elif [ -f "$settings_path" ]; then
	if [ -f "$_effort_cache" ] && [ "$_effort_cache" -nt "$settings_path" ]; then
		effort_level=$(<"$_effort_cache")
	else
		effort_val=$(jq -r '.effortLevel // empty' "$settings_path" 2>/dev/null)
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
    p_mode=$(head -n1 "$ponytail_flag" | tr -d '[:space:]')
    if [ -n "$p_mode" ] && [ "$p_mode" != "off" ]; then
        if [ "$p_mode" = "full" ]; then
            p_badge="[PONYTAIL]"
        else
            p_badge="[PONYTAIL:$(printf '%s' "$p_mode" | tr '[:lower:]' '[:upper:]')]"
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
	if [ -n "$git_root" ]; then # fast check avoids git subprocess for non-repo dirs
		git_branch=$(git -C "${cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null)
	fi
	if [ -n "$git_branch" ]; then
		out+="${dim}@${reset}${green}${git_branch}${reset}"
		git_stat=$(git -C "${cwd}" diff --numstat 2>/dev/null | awk '{a+=$1; d+=$2} END {if (a+d>0) printf "+%d -%d", a, d}')
		[ -n "$git_stat" ] && out+=" ${dim}(${reset}${green}${git_stat%% *}${reset} ${red}${git_stat##* }${reset}${dim})${reset}"
	fi
fi

# ===== Session segment (name + branch indicator) =====
# Resolve the active transcript: prefer transcript_path from stdin, else derive from
# the projects dir + session id (project hash = cwd with \ / : replaced by -).
transcript_msys=""
if [ -n "$transcript_path" ]; then
	transcript_msys=$(win_to_msys "$transcript_path")
fi
if [ ! -f "$transcript_msys" ] && [ -n "$session_id" ] && [ -n "$cwd" ]; then
	proj_hash=$(printf '%s' "$cwd" | tr '\\/:' '-')
	transcript_msys="${claude_config_dir}/projects/${proj_hash}/${session_id}.jsonl"
fi

if [ -f "$transcript_msys" ]; then
	# A forked (branch) session records its origin in forkedFrom.sessionId on line 1.
	forked_from=$(head -1 "$transcript_msys" 2>/dev/null | jq -r '.forkedFrom.sessionId // empty' 2>/dev/null)
	cur_title=$(sess_title "$transcript_msys" "$session_id")

	out+=" ${dim}|${reset} "
	if [ -n "$forked_from" ]; then
		# Branch: show parent › branch. Parent transcript lives in the same dir.
		parent_path="$(dirname "$transcript_msys")/${forked_from}.jsonl"
		parent_title=$(sess_title "$parent_path" "$forked_from")
		out+="${purple}Session:${reset} ${white}$(truncate_str "$parent_title" 22)${reset}"
		out+="${dim} › ${reset}${green}$(truncate_str "$cur_title" 22)${reset}"
	else
		out+="${purple}Session:${reset} ${white}$(truncate_str "$cur_title" 30)${reset}"
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
	out+=" ${dim}|${reset} "
	out+="${dim}cache${reset} ${cyan}$(format_tokens $cache_read)↓${reset}${dim}/${reset}${purple}$(format_tokens $cache_create)↑${reset} ${dim}(${reset}${hit_color}${hit_pct}%${reset}${dim})${reset}"
	# TTL residuo: prompt_cache.expires_at dal JSON di stdin (Claude Code >= 2.1.251).
	# Ogni richiesta rinnova la scadenza; null quando l'ultima risposta non aveva token in cache.
	if [ -n "$cache_expires_at" ]; then
		[ "$cache_ttl" = "1h" ] && ttl=3600 || ttl=300
		printf -v ttl_now '%(%s)T' -1
		ttl_left=$((cache_expires_at - ttl_now))
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

# Cache setup — shared across all Claude Code instances to avoid rate limits
claude_config_dir_hash=$(echo -n "$claude_config_dir" | shasum -a 256 2>/dev/null || echo -n "$claude_config_dir" | sha256sum 2>/dev/null)
claude_config_dir_hash=$(echo "$claude_config_dir_hash" | cut -c1-8)
cache_file="/tmp/claude/statusline-usage-cache-${claude_config_dir_hash}.json"
cache_max_age=180 # seconds between API calls
mkdir -p /tmp/claude

needs_refresh=true
usage_data=""

# Always load cache — used as primary source for API path, and as fallback when builtin reports zero
if [ -f "$cache_file" ] && [ -s "$cache_file" ]; then
	cache_mtime=$(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null)
	printf -v now '%(%s)T' -1 # bash built-in epoch (no subprocess)
	cache_age=$((now - cache_mtime))
	if [ "$cache_age" -lt "$cache_max_age" ]; then
		needs_refresh=false
	fi
	usage_data=$(<"$cache_file") # bash built-in file read (no subprocess)
fi

# When builtin values are all zero AND reset timestamps are missing, it likely indicates
# an API failure on Claude's side — fall through to cached data instead of displaying
# misleading 0%. Genuine zero responses (after a billing reset) still include valid
# resets_at timestamps, so we trust those.
effective_builtin=false
if $use_builtin; then
	# Trust builtin if any percentage is non-zero
	if { [ -n "$builtin_five_hour_pct" ] && [ "$(printf '%.0f' "$builtin_five_hour_pct" 2>/dev/null)" != "0" ]; } ||
		{ [ -n "$builtin_seven_day_pct" ] && [ "$(printf '%.0f' "$builtin_seven_day_pct" 2>/dev/null)" != "0" ]; }; then
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
# Throttled to cache_max_age and stampede-locked via touch for shared panes.
if $needs_refresh; then
	touch "$cache_file" # stampede lock: prevent parallel panes from fetching simultaneously
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
			if [ -n "$_resp" ] && echo "$_resp" | jq -e '.five_hour' >/dev/null 2>&1; then
				echo "$_resp" >"$cache_file"
			else
				[ -f "$cache_file" ] && [ ! -s "$cache_file" ] && rm -f "$cache_file"
			fi
		else
			[ -f "$cache_file" ] && [ ! -s "$cache_file" ] && rm -f "$cache_file"
		fi
	) >/dev/null 2>&1 &
	disown $! 2>/dev/null
fi

# Cross-platform ISO to epoch conversion
# Converts ISO 8601 timestamp (e.g. "2025-06-15T12:30:00Z" or "2025-06-15T12:30:00.123+00:00") to epoch seconds.
# Properly handles UTC timestamps and converts to local time.
iso_to_epoch() {
	local iso_str="$1"

	# Try GNU date first (Linux) — handles ISO 8601 format automatically
	local epoch
	epoch=$(date -d "${iso_str}" +%s 2>/dev/null)
	if [ -n "$epoch" ]; then
		echo "$epoch"
		return 0
	fi

	# BSD date (macOS) - handle various ISO 8601 formats
	local stripped="${iso_str%%.*}"                # Remove fractional seconds (.123456)
	stripped="${stripped%%Z}"                      # Remove trailing Z
	stripped="${stripped%%+*}"                     # Remove timezone offset (+00:00)
	stripped="${stripped%%-[0-9][0-9]:[0-9][0-9]}" # Remove negative timezone offset

	# Check if timestamp is UTC (has Z or +00:00 or -00:00)
	if [[ "$iso_str" == *"Z"* ]] || [[ "$iso_str" == *"+00:00"* ]] || [[ "$iso_str" == *"-00:00"* ]]; then
		# For UTC timestamps, parse with timezone set to UTC
		epoch=$(env TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
	else
		epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
	fi

	if [ -n "$epoch" ]; then
		echo "$epoch"
		return 0
	fi

	return 1
}

# Format ISO reset time to compact local time
# Usage: format_reset_time <iso_string> <style: time|datetime|date>
format_reset_time() {
	local iso_str="$1"
	local style="$2"
	{ [ -z "$iso_str" ] || [ "$iso_str" = "null" ]; } && return

	# Parse ISO datetime and convert to local time (cross-platform)
	local epoch
	epoch=$(iso_to_epoch "$iso_str")
	[ -z "$epoch" ] && return

	# Format based on style
	# Try GNU date first (Linux), then BSD date (macOS)
	# Previous implementation piped BSD date through sed/tr, which always returned
	# exit code 0 from the last pipe stage, preventing the GNU date fallback from
	# ever executing on Linux.
	local formatted=""
	case "$style" in
	time)
		formatted=$(date -d "@$epoch" +"%H:%M" 2>/dev/null) ||
			formatted=$(date -j -r "$epoch" +"%H:%M" 2>/dev/null)
		;;
	datetime)
		formatted=$(date -d "@$epoch" +"%b %-d, %H:%M" 2>/dev/null) ||
			formatted=$(date -j -r "$epoch" +"%b %-d, %H:%M" 2>/dev/null)
		;;
	*)
		formatted=$(date -d "@$epoch" +"%b %-d" 2>/dev/null) ||
			formatted=$(date -j -r "$epoch" +"%b %-d" 2>/dev/null)
		;;
	esac
	[ -n "$formatted" ] && echo "$formatted"
}

sep=" ${dim}|${reset} "

# Render extra_usage segment from API usage data (not available via stdin rate_limits).
# Appends to the global $out. No-op when data is missing or is_enabled is false.
render_extra_usage() {
	local data="$1"
	[ -z "$data" ] && return
	local enabled
	enabled=$(echo "$data" | jq -r '.extra_usage.is_enabled // false' 2>/dev/null)
	[ "$enabled" != "true" ] && return

	local pct used limit
	pct=$(echo "$data" | jq -r '.extra_usage.utilization // 0' | awk '{printf "%.0f", $1}')
	used=$(echo "$data" | jq -r '.extra_usage.used_credits // 0' | LC_NUMERIC=C awk '{printf "%.2f", $1/100}')
	limit=$(echo "$data" | jq -r '.extra_usage.monthly_limit // 0' | LC_NUMERIC=C awk '{printf "%.2f", $1/100}')

	if [ -n "$used" ] && [ -n "$limit" ] && [[ "$used" != *'$'* ]] && [[ "$limit" != *'$'* ]]; then
		local color
		color=$(usage_color "$pct")
		out+="${sep}${white}extra${reset} ${color}\$${used}/\$${limit}${reset}"
	else
		out+="${sep}${white}extra${reset} ${green}enabled${reset}"
	fi
}

if $effective_builtin; then
	# ---- Use rate_limits data provided directly by Claude Code in JSON input ----
	# resets_at values are Unix epoch integers in this source
	if [ -n "$builtin_five_hour_pct" ]; then
		five_hour_pct=$(printf "%.0f" "$builtin_five_hour_pct")
		five_hour_color=$(usage_color "$five_hour_pct")
		out+="${sep}${white}5h${reset} ${five_hour_color}${five_hour_pct}%${reset}"
		if [ -n "$builtin_five_hour_reset" ] && [ "$builtin_five_hour_reset" != "null" ]; then
			printf -v five_hour_reset "%(%H:%M)T" "$builtin_five_hour_reset"
			[ -n "$five_hour_reset" ] && out+=" ${dim}@${five_hour_reset}${reset}"
		fi
	fi

	if [ -n "$builtin_seven_day_pct" ]; then
		seven_day_pct=$(printf "%.0f" "$builtin_seven_day_pct")
		seven_day_color=$(usage_color "$seven_day_pct")
		out+="${sep}${white}7d${reset} ${seven_day_color}${seven_day_pct}%${reset}"
		if [ -n "$builtin_seven_day_reset" ] && [ "$builtin_seven_day_reset" != "null" ]; then
			printf -v seven_day_reset "%(%b %e, %H:%M)T" "$builtin_seven_day_reset"
			seven_day_reset="${seven_day_reset//  / }" # normalize "May  8" → "May 8" for single-digit days
			[ -n "$seven_day_reset" ] && out+=" ${dim}@${seven_day_reset}${reset}"
		fi
	fi

	# Render extra_usage from API cache (stdin rate_limits doesn't expose it)
	render_extra_usage "$usage_data"
	# Cache update omitted: the async background API fetch maintains the cache file,
	# including extra_usage. Writing incomplete builtin data here would overwrite it.
elif [ -n "$usage_data" ] && echo "$usage_data" | jq -e '.five_hour' >/dev/null 2>&1; then
	# ---- Fall back: API-fetched usage data ----
	# ---- 5-hour (current) ----
	five_hour_pct=$(echo "$usage_data" | jq -r '.five_hour.utilization // 0' | awk '{printf "%.0f", $1}')
	five_hour_reset_iso=$(echo "$usage_data" | jq -r '.five_hour.resets_at // empty')
	five_hour_reset=$(format_reset_time "$five_hour_reset_iso" "time")
	five_hour_color=$(usage_color "$five_hour_pct")

	out+="${sep}${white}5h${reset} ${five_hour_color}${five_hour_pct}%${reset}"
	[ -n "$five_hour_reset" ] && out+=" ${dim}@${five_hour_reset}${reset}"

	# ---- 7-day (weekly) ----
	seven_day_pct=$(echo "$usage_data" | jq -r '.seven_day.utilization // 0' | awk '{printf "%.0f", $1}')
	seven_day_reset_iso=$(echo "$usage_data" | jq -r '.seven_day.resets_at // empty')
	seven_day_reset=$(format_reset_time "$seven_day_reset_iso" "datetime")
	seven_day_color=$(usage_color "$seven_day_pct")

	out+="${sep}${white}7d${reset} ${seven_day_color}${seven_day_pct}%${reset}"
	[ -n "$seven_day_reset" ] && out+=" ${dim}@${seven_day_reset}${reset}"

	render_extra_usage "$usage_data"
else
	# No valid usage data — show placeholders
	out+="${sep}${white}5h${reset} ${dim}-${reset}"
	out+="${sep}${white}7d${reset} ${dim}-${reset}"
fi

# ===== Update check (cached, 24h TTL) =====
version_cache_file="/tmp/claude/statusline-version-cache.json"
version_cache_max_age=86400 # 24 hours

version_needs_refresh=true
version_data=""

if [ -f "$version_cache_file" ]; then
	vc_mtime=$(stat -c %Y "$version_cache_file" 2>/dev/null || stat -f %m "$version_cache_file" 2>/dev/null)
	printf -v vc_now '%(%s)T' -1 # bash built-in epoch (no subprocess)
	vc_age=$((vc_now - vc_mtime))
	if [ "$vc_age" -lt "$version_cache_max_age" ]; then
		version_needs_refresh=false
	fi
	version_data=$(<"$version_cache_file") # bash built-in file read (no subprocess)
fi

if $version_needs_refresh; then
	touch "$version_cache_file" 2>/dev/null
	# Fetch asynchronously — version data is non-critical and can lag one render.
	(
		_vc=$(curl -s --max-time 5 \
			-H "Accept: application/vnd.github+json" \
			"https://api.github.com/repos/daniel3303/ClaudeCodeStatusLine/releases/latest" 2>/dev/null)
		if [ -n "$_vc" ] && echo "$_vc" | jq -e '.tag_name' >/dev/null 2>&1; then
			echo "$_vc" >"$version_cache_file"
		elif [ ! -s "$version_cache_file" ]; then
			rm -f "$version_cache_file" 2>/dev/null
		fi
	) >/dev/null 2>&1 &
	disown $! 2>/dev/null
fi

update_line=""
if [ -n "$version_data" ]; then
	latest_tag=$(echo "$version_data" | jq -r '.tag_name // empty')
	if [ -n "$latest_tag" ] && version_gt "$latest_tag" "$VERSION"; then
		update_line="\n${dim}Update available: ${latest_tag} → Tell Claude: \"Find my installed status bar and update it\"${reset}"
	fi
fi

# Output
printf "%b" "$out$update_line"

exit 0
