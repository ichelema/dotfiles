#!/usr/bin/env bash
set -euo pipefail

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows ;;
  Linux*) PLATFORM=linux ;;
  *)
    printf 'Sistema operativo non supportato: %s\n' "$(uname -s)" >&2
    exit 1
    ;;
esac

PROFILE="${CHROME_CDP_PROFILE:-$HOME/.cache/chrome-cdp-profile}"
PORT="${CHROME_CDP_PORT:-9222}"
HOST="${CDP_HOST:-127.0.0.1}"
START_TIMEOUT="${CHROME_CDP_START_TIMEOUT:-30}"
PORT_FILE="$PROFILE/DevToolsActivePort"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Comando richiesto non trovato: %s\n' "$1" >&2
    exit 1
  fi
}

require_command curl
require_command ruby

if [[ "$PLATFORM" == windows ]]; then
  require_command cygpath
fi

find_chrome() {
  local candidate

  if [[ -n "${CHROME_BIN:-}" ]]; then
    if [[ -x "$CHROME_BIN" ]]; then
      printf '%s\n' "$CHROME_BIN"
      return 0
    elif command -v "$CHROME_BIN" >/dev/null 2>&1; then
      command -v "$CHROME_BIN"
      return 0
    fi
    return 1
  fi

  if [[ "$PLATFORM" == windows ]]; then
    for candidate in \
      '/c/Program Files/Google/Chrome/Application/chrome.exe' \
      '/c/Program Files (x86)/Google/Chrome/Application/chrome.exe'; do
      if [[ -f "$candidate" ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done
  else
    for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
      if command -v "$candidate" >/dev/null 2>&1; then
        command -v "$candidate"
        return 0
      fi
    done
  fi

  return 1
}

if ! CHROME_BIN="$(find_chrome)"; then
  if [[ "$PLATFORM" == windows ]]; then
    printf 'Chrome non trovato. Imposta CHROME_BIN con il percorso di chrome.exe.\n' >&2
  else
    printf 'Chrome/Chromium non trovato. Imposta CHROME_BIN con il percorso del browser.\n' >&2
  fi
  exit 1
fi

mkdir -p "$PROFILE"
if [[ "$PLATFORM" == windows ]]; then
  PROFILE_LAUNCH="$(cygpath -w "$PROFILE")"
  PORT_FILE_EXPORT="$(cygpath -w "$PORT_FILE")"
else
  PROFILE_LAUNCH="$PROFILE"
  PORT_FILE_EXPORT="$PORT_FILE"
fi

CDP_URL="http://${HOST}:${PORT}/json/version"

write_port_file() {
  local version_json
  local -a endpoint

  if ! version_json="$(curl -fsS --max-time 3 "$CDP_URL")"; then
    return 1
  fi

  mapfile -t endpoint < <(
    printf '%s' "$version_json" | ruby -rjson -ruri -e '
      uri = URI.parse(JSON.parse(STDIN.read).fetch("webSocketDebuggerUrl"))
      puts uri.port
      puts uri.request_uri
    '
  )

  if [[ "${#endpoint[@]}" -lt 2 || -z "${endpoint[0]}" || -z "${endpoint[1]}" ]]; then
    printf 'Endpoint WebSocket CDP non valido.\n' >&2
    return 1
  fi

  printf '%s\n%s\n' "${endpoint[0]}" "${endpoint[1]}" > "$PORT_FILE"
}

cdp_ready() {
  curl -fsS --max-time 2 "$CDP_URL" >/dev/null 2>&1
}

if cdp_ready; then
  # Chrome potrebbe essere stato avviato da un altro processo/profilo.
  # Ricreiamo comunque il file usato da cdp.mjs con l'endpoint corrente.
  write_port_file || {
    printf 'Chrome risponde, ma non è stato possibile creare %s.\n' "$PORT_FILE" >&2
    exit 1
  }
  printf 'Chrome CDP è già attivo sulla porta %s.\n' "$PORT"
else
  if [[ "$PLATFORM" == windows ]]; then
    MSYS_NO_PATHCONV=1 "$CHROME_BIN" \
      --remote-debugging-port="$PORT" \
      --user-data-dir="$PROFILE_LAUNCH" \
      --no-first-run \
      --no-default-browser-check \
      >/dev/null 2>&1 &
  else
    "$CHROME_BIN" \
      --remote-debugging-port="$PORT" \
      --user-data-dir="$PROFILE_LAUNCH" \
      --no-first-run \
      --no-default-browser-check \
      >/dev/null 2>&1 &
  fi

  ready=0
  for ((i = 0; i < START_TIMEOUT * 2; i++)); do
    if cdp_ready && write_port_file; then
      ready=1
      break
    fi
    sleep 0.5
  done

  if (( ! ready )); then
    printf 'Chrome è stato avviato, ma CDP non è disponibile entro %ss sulla porta %s.\n' "$START_TIMEOUT" "$PORT" >&2
    exit 1
  fi

  printf 'Chrome CDP avviato sulla porta %s.\n' "$PORT"
fi

printf 'Per usare cdp.mjs nella shell corrente, esegui:\n'
printf 'export CDP_PORT_FILE=%q\n' "$PORT_FILE_EXPORT"
