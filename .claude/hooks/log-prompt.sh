#!/usr/bin/env bash
# UserPromptSubmit: пишет каждый промпт в журнал сессий.
# Закрывает бонусный пункт ДЗ «журнал сессий с дословными промптами».
#
# Имя разработчика ищется цепочкой, а НЕ только в переменной окружения.
# Причина: процесс Claude Code берёт окружение при старте, и правка
# ~/.zshenv или ~/.zshrc до него не доходит до перезапуска — записи молча
# уходят в unknown/, а обнаруживается это через день. Файл и git-конфиг
# читаются в момент вызова, поэтому работают сразу.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"

resolve_name() {
  # 1. Переменная окружения — если её всё-таки выставили для процесса.
  if [ -n "${DEV_NAME:-}" ]; then
    printf '%s' "$DEV_NAME"
    return
  fi

  # 2. Локальный файл рядом с проектом. Не коммитится, у каждого свой.
  if [ -f "$root/.claude/dev-name" ]; then
    name=$(tr -d '[:space:]' < "$root/.claude/dev-name")
    if [ -n "$name" ]; then
      printf '%s' "$name"
      return
    fi
  fi

  # 3. Git-конфиг: он уже настроен у всех, кто коммитит.
  name=$(git -C "$root" config user.name 2>/dev/null || true)
  if [ -n "$name" ]; then
    printf '%s' "$name" | tr ' ' '-'
    return
  fi

  printf 'unknown'
}

payload=$(cat)
who=$(resolve_name)
dir="$root/sessions/$who"
mkdir -p "$dir"

prompt=$(printf '%s' "$payload" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

file="$dir/$(date +%Y-%m-%d).md"
if [ ! -f "$file" ]; then
  printf '# Журнал сессий — %s — %s\n' "$who" "$(date +%Y-%m-%d)" > "$file"
fi

branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-")
{
  printf '\n## %s · ветка `%s`\n\n' "$(date +%H:%M:%S)" "$branch"
  printf '```\n%s\n```\n' "$prompt"
} >> "$file"

exit 0
