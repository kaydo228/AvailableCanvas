#!/usr/bin/env bash
# PreToolUse на Bash: блокирует разрушительные команды и чтение секретов из терминала.
# ВНИМАНИЕ: это шаблон на строку команды. Он обходится сменой команды —
# см. раздел «Что не сработало» в REPORT.md. Это известное ограничение, а не баг.
set -euo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
  exit 0
}

if printf '%s' "$cmd" | grep -Eq 'rm[[:space:]]+-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+/([[:space:]]|$)'; then
  deny "rm -rf по корню. Заблокировано."
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push[[:space:]]+.*(--force|-f)([[:space:]]|$)'; then
  deny "Форс-пуш заблокирован. Ветка общая, мержим через PR."
fi
if printf '%s' "$cmd" | grep -Eq '(cat|less|more|head|tail|open|bat)[^|;]*\.(env|pem|key)'; then
  deny "Чтение файла с секретами через терминал заблокировано."
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(checkout|switch|reset)[[:space:]]+([^[:space:]]+[[:space:]]+)*([^[:space:]/]+/)?(main|master)([[:space:]]|$)'; then
  deny "Переключение и сброс main из сессии запрещены. Работаем только в своей ветке."
fi

exit 0
