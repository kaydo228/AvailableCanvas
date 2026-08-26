#!/usr/bin/env bash
# Stop: не даёт закончить сессию со сломанными типами или линтом.
#
# Перед проверкой применяет БЕЗОПАСНЫЕ автоправки: отступы и порядок импортов
# машина чинит сама, человека дёргают только там, где нужно решение.
# `--unsafe` сознательно не включён — он меняет смысл кода.
#
# Три защиты, все появились не от хорошей жизни:
#   1) файл-марка — иначе стабильно падающая проверка зацикливает сессию;
#   2) проверка, что проект существует — иначе хук блокирует работу в репозитории,
#      где ещё нет package.json;
#   3) никакого bash 4 (mapfile, declare -A): в macOS системный bash 3.2,
#      и хук на нём падает молча.
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

has_biome() {
  [ -f "$root/biome.json" ] || [ -f "$root/biome.jsonc" ]
}

# Безопасные автоправки до проверок: то, что чинится машиной, не должно
# превращаться в список замечаний человеку.
if has_biome; then
  (cd "$root" && npx --no-install biome check --write . >/dev/null 2>&1) || true
fi

if has_script typecheck; then
  if ! out=$(cd "$root" && npm run --silent typecheck 2>&1); then
    touch "$mark"
    printf 'Типы не сходятся, чинить до конца сессии:\n%s\n' "$out" >&2
    exit 2
  fi
fi

if has_biome; then
  if ! out=$(cd "$root" && npx --no-install biome check . 2>&1); then
    touch "$mark"
    printf 'Линт не проходит — осталось то, что автоправкой не чинится:\n%s\n' "$out" >&2
    exit 2
  fi
fi

exit 0
