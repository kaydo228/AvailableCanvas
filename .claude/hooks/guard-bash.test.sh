#!/usr/bin/env bash
# Проверка guard-bash.sh: таблица «команда → ожидание».
#
# Зачем файлом, а не руками в сессии: 27 августа обход хука проверялся
# вручную, результат жил в диалоге, и починка правила ничем не была
# закреплена. Первое же изменение регэкспа тихо сломало бы то, что раньше
# ловилось. Запуск: bash .claude/hooks/guard-bash.test.sh
#
# Обратите внимание на четвёртый и пятый случаи: ровно ими прошлая версия
# правила обходилась насквозь, а третий раньше отбивался по случайному
# совпадению подстроки «open», а не потому, что распознан питон.
set -uo pipefail

hook="$(cd "$(dirname "$0")" && pwd)/guard-bash.sh"
pass=0
fail=0

check() {
  local expect="$1" name="$2" cmd="$3"
  local out got
  out=$(printf '%s' "$cmd" | jq -Rs '{tool_input: {command: .}}' | bash "$hook")
  if printf '%s' "$out" | grep -q '"permissionDecision":"deny"'; then got=deny; else got=allow; fi

  if [ "$got" = "$expect" ]; then
    pass=$((pass + 1))
    printf '  ok    %-8s %s\n' "$got" "$name"
  else
    fail=$((fail + 1))
    printf '  ПРОВАЛ ожидали %s, получили %s — %s\n' "$expect" "$got" "$name"
  fi
}

echo "── Секреты: должны отбиваться ─────────────────────────────────────────"
check deny 'обычная читалка'            'cat .env'
check deny 'читалка с путём'            'head -20 ../config/service.pem'
check deny 'интерпретатор, вызов чтения' 'python3 -c "print(open(qqq.env).read())"'
check deny 'интерпретатор без слова open' 'python3 -c "import pathlib; print(pathlib.Path(qqq.env).read_text())"'
check deny 'перенаправление ввода'       'exec 3< .env; while read -r line <&3; do echo "$line"; done'
check deny 'дампер'                      'xxd deploy.key'
check deny 'ключ ssh по имени'           'cat ~/.ssh/id_ed25519'
check deny 'копирование секрета наружу'  'cp .env /tmp/stolen.txt'

echo "── Разрушительное: должно отбиваться ──────────────────────────────────"
check deny 'снос корня'                  'rm -rf /'
check deny 'форс-пуш'                    'git push --force origin feature'
check deny 'переключение на main'        'git switch main'

echo "── Ложные срабатывания: должны проходить ──────────────────────────────"
check allow 'слово env в прозе'          'grep -n "переменные окружения" docs/SPEC.md'
check allow 'обычный листинг'            'ls -la ~/.ssh'
check allow 'сборка'                     'npm run build'
check allow 'чтение README'              'cat README.md'
check allow 'ветка не main'              'git switch feat/connectors'
check allow 'слово key внутри имени'     'cat src/features/shortcuts/lib/keyHint.ts'

echo
printf 'Итого: %d прошло, %d провалено\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
