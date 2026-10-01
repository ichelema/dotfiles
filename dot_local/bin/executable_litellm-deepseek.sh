#!/usr/bin/env bash
set -euo pipefail

export LITELLM_MASTER_KEY="$(cat "$HOME/.litellm/master-key.txt")"

export ANTHROPIC_BASE_URL="http://127.0.0.1:4000"
export ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY"

export ANTHROPIC_MODEL="claude-deepseek-flash"
export ANTHROPIC_DEFAULT_SONNET_MODEL="claude-deepseek-flash"
export ANTHROPIC_DEFAULT_OPUS_MODEL="claude-deepseek-flash"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-deepseek-flash"
export ANTHROPIC_DEFAULT_FABLE_MODEL="claude-deepseek-flash"
export DISABLE_TELEMETRY="1"
export DISABLE_NON_ESSENTIAL_MODEL_CALLS="1"

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
