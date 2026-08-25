#!/usr/bin/env bash
# PostToolUse на Bash: форматирует файлы, изменённые командой в терминале.
#
# Зачем отдельный хук: format-file.sh висит на Write|Edit и видит только те
# записи, которые прошли через эти инструменты. Запись через heredoc, sed
# или скрипт его обходит — форматирование копилось молча и вылезало
# только на Stop. Здесь список изменённого берём у git, а не у инструмента.
#
# Никаких mapfile и прочего из bash 4: в macOS системный bash — 3.2,
# и на нём хук падал молча, ровно повторяя ту проблему, которую чинит.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" || exit 0

# Не git-репозиторий — не по чему определять изменения.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

list=$(
  git status --porcelain --untracked-files=all 2>/dev/null \
    | awk '{ if ($1 == "R") print $NF; else print $2 }' \
    | grep -Ei '\.(ts|tsx|js|jsx|json|jsonc|css)$' \
    | head -200
)

[ -z "$list" ] && exit 0

# Удалённые файлы отсеиваем: biome на них ругается.
existing=$(
  printf '%s\n' "$list" | while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f" ] && printf '%s\n' "$f"
  done
)

[ -z "$existing" ] && exit 0

printf '%s\n' "$existing" \
  | tr '\n' '\0' \
  | xargs -0 npx --no-install biome check --write >/dev/null 2>&1 || true

exit 0
