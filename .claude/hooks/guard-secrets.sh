#!/usr/bin/env bash
# PreToolUse на Write|Edit: не даёт агенту писать в файлы с секретами.
set -euo pipefail

payload=$(cat)
path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[ -z "$path" ] && exit 0

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

case "$path" in
  *.env|*.env.*|*.pem|*.key|*id_rsa*|*secrets*|*/.claude/settings.local.json|*/.npmrc)
    deny "Файл с секретами или локальной конфигурацией: ${path}. Правится только руками." ;;
esac

exit 0
