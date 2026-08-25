#!/usr/bin/env bash
# UserPromptSubmit: пишет каждый промпт в журнал сессий.
# Закрывает бонусный пункт ДЗ «журнал сессий с дословными промптами».
set -euo pipefail

payload=$(cat)
who="${DEV_NAME:-unknown}"
root="${CLAUDE_PROJECT_DIR:-$PWD}"
dir="$root/sessions/$who"
mkdir -p "$dir"

prompt=$(printf '%s' "$payload" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

file="$dir/$(date +%Y-%m-%d).md"
if [ ! -f "$file" ]; then
  printf '# Журнал сессий — %s — %s\n' "$who" "$(date +%Y-%m-%d)" > "$file"
fi

# symbolic-ref, а не rev-parse: в репозитории без коммитов rev-parse печатает
# "HEAD" и одновременно падает, из-за чего в branch попадал и фолбэк "-".
branch=$(git -C "$root" symbolic-ref --short -q HEAD 2>/dev/null || echo "-")
{
  printf '\n## %s · ветка `%s`\n\n' "$(date +%H:%M:%S)" "$branch"
  printf '```\n%s\n```\n' "$prompt"
} >> "$file"

exit 0
