#!/usr/bin/env bash
set -euo pipefail

export LITELLM_MASTER_KEY="$(cat "$HOME/.litellm/master-key.txt")"

export ANTHROPIC_BASE_URL="http://127.0.0.1:4000"
# Niente ANTHROPIC_AUTH_TOKEN, come in litellm-claude.sh: il proxy si autentica con
# x-litellm-api-key (sotto), e Claude Code manda il token OAuth dell'abbonamento, che
# LiteLLM inoltra solo agli alias claude-* (forward_client_headers_to_llm_api). Serve
# al classificatore dell'auto mode su claude-haiku (CLAUDE_CODE_AUTO_MODE_MODEL):
# con il master key al posto del token OAuth l'alias risponde 401.

export ANTHROPIC_MODEL="claude-gemini-4-neon"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-gemini-4-neon"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-gemini-4-neon"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-gemini-4-neon"
export ANTHROPIC_DEFAULT_FABLE_MODEL="claude-gemini-4-neon"
export DISABLE_TELEMETRY="1"
export DISABLE_NON_ESSENTIAL_MODEL_CALLS="1"
# Neon non supporta la cache esplicita (400 se Claude Code manda cache_control);
# la cache implicita di Google resta attiva e si paga $0.15/MTok.
export DISABLE_PROMPT_CACHING="1"
# Il classificatore dell'auto mode userebbe ANTHROPIC_DEFAULT_SONNET_MODEL (Neon) e
# manda cache_control anche con DISABLE_PROMPT_CACHING: sopra la soglia di token
# LiteLLM chiama cachedContents, Neon risponde 400 e Claude Code nega l'azione
# («temporarily unavailable»). Haiku 5.5 è un modello supportato per il classificatore.
export CLAUDE_CODE_AUTO_MODE_MODEL="claude-haiku"

export ANTHROPIC_CUSTOM_HEADERS="x-litellm-api-key: Bearer ${LITELLM_MASTER_KEY}"

export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1

WORKING_DIRECTORY="$(pwd -P)"
PLATFORM="$(uname -srm 2>/dev/null || printf 'unknown')"

PERMISSION_POLICY="${CLAUDE_PERMISSION_POLICY:-Enforce the active Claude Code permission configuration and request approval when required.}"

REPOSITORY_INSTRUCTIONS="${CLAUDE_REPOSITORY_INSTRUCTIONS:-Load and follow all applicable CLAUDE.md and AGENTS.md files for the current working tree. More specific repository instructions override generic conventions within their scope.}"

ENVIRONMENT_CONTEXT="$(cat <<EOF
## Environment Context

Working directory: ${WORKING_DIRECTORY}
Platform: ${PLATFORM}
Permission policy: ${PERMISSION_POLICY}

<repository_instructions>
${REPOSITORY_INSTRUCTIONS}
</repository_instructions>
EOF
)"

TOOLS="Agent,Bash,CronCreate,CronDelete,CronList,Edit,Glob,Grep,ListAgents,ListMcpResourcesTool,LSP,Read,ReadMcpResourceDirTool,ReadMcpResourceTool,ScheduleWakeup,SendMessage,Skill,TaskCreate,TaskGet,TaskList,TaskOutput,TaskStop,TaskUpdate,WaitForMcpServers,WebFetch,WebSearch,Write"

exec claude --tools "$TOOLS" --append-system-prompt "$ENVIRONMENT_CONTEXT" "$@"
