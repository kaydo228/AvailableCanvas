#!/usr/bin/env bash
# Stop: не даёт закончить сессию со сломанным типом или линтом.
# Защита от петли: второй подряд отказ пропускает сессию.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
mark="$root/.claude/.stop-gate-tripped"

# Второй подряд отказ — пропускаем, иначе сессия зациклится.
if [ -f "$mark" ]; then
  rm -f "$mark"
  exit 0
fi

# Проекта ещё нет — проверять нечего. Актуально до дня 1,
# пока B не поднял скелет.
[ -f "$root/package.json" ] || exit 0

has_script() {
  node -e "process.exit(require('$root/package.json').scripts?.['$1'] ? 0 : 1)" 2>/dev/null
}

if has_script typecheck; then
  if ! out=$(cd "$root" && npm run --silent typecheck 2>&1); then
    touch "$mark"
    printf 'Типы не сходятся, чинить до конца сессии:\n%s\n' "$out" >&2
    exit 2
  fi
fi

if [ -f "$root/biome.json" ] || [ -f "$root/biome.jsonc" ]; then
  if ! out=$(cd "$root" && npx --no-install biome check . 2>&1); then
    touch "$mark"
    printf 'Линт не проходит:\n%s\n' "$out" >&2
    exit 2
  fi
fi

exit 0
