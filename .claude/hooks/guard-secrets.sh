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
  # Домашние каталоги с ключами и учётными данными. Добавлены 27 августа
  # после эксперимента с изоляцией: запись в ~/.ssh прошла беспрепятственно,
  # а в списке ниже его не было — граница рабочей папки не защищает ничего.
  # Слеш перед именем каталога писать нельзя: путь приходит и относительным,
  # и тогда «.ssh/config» прошёл бы мимо — ровно та же дыра, которую это
  # правило закрывает, только с другой стороны. Нашло ревью 27 августа.
  .ssh/*|.gnupg/*|.aws/*|.netrc|*/.ssh/*|*/.gnupg/*|*/.aws/*|*/.config/gh/*|*/.docker/config.json|*/.netrc)
    deny "Каталог с ключами и учётными данными: ${path}. Агенту сюда нельзя." ;;
  *.env|*.env.*|*.pem|*.key|*id_rsa*|*id_ed25519*|*secrets*|*/.claude/settings.local.json|*/.npmrc)
    deny "Файл с секретами или локальной конфигурацией: ${path}. Правится только руками." ;;
esac

exit 0
