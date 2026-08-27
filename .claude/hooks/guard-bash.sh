#!/usr/bin/env bash
# PreToolUse на Bash: блокирует разрушительные команды и чтение секретов из терминала.
# ВНИМАНИЕ: это шаблон на строку команды. Он поднимает цену обхода, но не делает
# его невозможным — см. раздел «Проверка собственного хука» в REPORT.md.
# Это известное ограничение, а не баг.
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

# ── Чтение секретов ───────────────────────────────────────────────────────
#
# Прошлая версия правила искала подстроку `(cat|less|...|open|bat)` где угодно
# в тексте команды. Проверка 27 августа показала две вещи сразу:
#   • питон с вызовом open() отбивался СЛУЧАЙНО — совпадала подстрока «open»
#     из имени функции, а не программа `open`;
#   • pathlib с read_text() и чтение через файловый дескриптор проходили насквозь.
# То есть защита срабатывала и не срабатывала по причинам, не связанным с тем,
# читается файл или нет. Разбор — в REPORT.md, «Проверка собственного хука».
#
# Здесь два правила вместо одного: читалки как настоящее СЛОВО команды,
# а не подстрока, и отдельно — интерпретаторы и перенаправление ввода рядом
# с путём к секрету, потому что именно ими обходилось первое правило.
#
# Оговорка, которая никуда не делась: «прочитать файл» — это результат,
# а не команда, и путей к нему сотни. Список ниже закрывает известные,
# а не все. Механизм, который не обходится сменой команды, — права ОС
# на сам файл; хук лишь поднимает цену попытки и оставляет след в логе.

word_start='(^|[;&|(`$[:space:]])'
secret_path='(\.(env|pem|key|p12|pfx)([^[:alnum:]]|$)|(^|[^[:alnum:]])(id_rsa|id_ed25519|\.ssh/|\.aws/|\.gnupg/|\.netrc|\.npmrc))'
readers="${word_start}(cat|less|more|head|tail|bat|open|nl|xxd|od|strings|dd|awk|sed|cut|column|tee|cp|scp|rsync)([[:space:]]|$)"
interpreters="${word_start}(python[0-9.]*|perl|ruby|node|deno|bun|php|osascript|exec|source)([[:space:]]|$)"
redirect='<[[:space:]]*[^[:space:]<>]*(env|pem|key|rsa|ed25519|netrc|npmrc)'

if printf '%s' "$cmd" | grep -Eq "$secret_path"; then
  if printf '%s' "$cmd" | grep -Eq "$readers"; then
    deny "Чтение файла с секретами через терминал заблокировано (программа-читалка)."
  fi
  if printf '%s' "$cmd" | grep -Eq "$interpreters"; then
    deny "Чтение секретов через интерпретатор заблокировано — это обход списка читалок."
  fi
  if printf '%s' "$cmd" | grep -Eq "$redirect"; then
    deny "Чтение секретов через перенаправление ввода заблокировано."
  fi
fi

if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(checkout|switch|reset)[[:space:]]+([^[:space:]]+[[:space:]]+)*([^[:space:]/]+/)?(main|master)([[:space:]]|$)'; then
  deny "Переключение и сброс main из сессии запрещены. Работаем только в своей ветке."
fi

exit 0
