#!/usr/bin/env bash
# PostToolUse на Write|Edit: форматирует изменённый файл, чтобы не спорить о стиле.
set -euo pipefail

payload=$(cat)
path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0
[ -f "$path" ] || exit 0

case "$path" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css)
    npx --no-install biome check --write "$path" >/dev/null 2>&1 || true ;;
esac

exit 0
