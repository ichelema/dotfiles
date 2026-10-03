#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.litellm"

KEY_FILE="$HOME/.litellm/master-key.txt"
CONFIG_FILE="$HOME/.litellm/litellm_config.yaml"

if [ ! -f "$KEY_FILE" ]; then
  printf "sk-local-%s\n" "$(openssl rand -hex 24)" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi

export LITELLM_MASTER_KEY="$(cat "$KEY_FILE")"

export DATABASE_URL="postgresql://hindsight:hindsight@127.0.0.1:5432/litellm?sslmode=disable"
export CONFIG_FILE_PATH="$CONFIG_FILE"
export UI_USERNAME="admin"
export UI_PASSWORD="${LITELLM_MASTER_KEY}"

# PATH aggiuntivi: Node mise (npm non-crash) + Python Scripts (prisma-client-py)
export PATH="$HOME/.local/share/mise/installs/node/24.16.0:$HOME/.local/share/mise/installs/python/3.13.13/Scripts:$PATH"
export PYTHONUTF8=1
export SSL_CERT_FILE=C:/certs/cacert.pem
# localhost bypassa il proxy (l'engine Prisma e il DB sono locali)
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="localhost,127.0.0.1,::1"

# Avvio via launcher uvicorn diretto (NON la CLI `litellm`): su Windows la CLI
# lancia subprocess Node che emettono un CTRL_C_EVENT spurio sul console group
# e fanno uscire uvicorn subito dopo lo startup. Vedi commenti nel launcher.
PYTHON_BIN="$HOME/.local/share/mise/installs/python/3.13.13/python.exe"
LAUNCHER="$HOME/.local/bin/litellm-proxy-run.py"
export LITELLM_HOST="127.0.0.1"
export LITELLM_PORT="4000"

if [ ! -f "$PYTHON_BIN" ] || [ ! -f "$LAUNCHER" ]; then
  echo "Errore: python di mise o launcher non trovato."
  echo "  python:   $PYTHON_BIN"
  echo "  launcher: $LAUNCHER"
  exit 1
fi

# PostgreSQL condiviso: avvio pg0 gestito localmente, senza dipendenze da Trinity.
if ! HS_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/trinity" "$PYTHON_BIN" "$HOME/.local/bin/litellm-pg-ensure.py"; then
  echo "Errore: pg0 Hindsight non è pronto o i suoi metadata non sono coerenti."
  exit 1
fi
echo "Postgres OK su 127.0.0.1:5432"

echo "═══════════════════════════════════════════════"
echo "  LiteLLM proxy → ChatGPT Max / Claude Max OAuth"
echo "  Config: $CONFIG_FILE"
echo "  Running on http://${LITELLM_HOST}:${LITELLM_PORT}"
echo "  Stop: premi Ctrl+C due volte (rapide)"
echo "═══════════════════════════════════════════════"

"$PYTHON_BIN" "$LAUNCHER"
