#!/usr/bin/env bash
# Stop: дописывает в журнал сессий ответ агента на последний промпт.
#
# Зачем отдельный хук. `log-prompt.sh` на `UserPromptSubmit` пишет только
# промпты человека — ответы агента в журнал не попадали вовсе. Обнаружилось
# это в день сдачи: журнал за неделю есть, а что агент отвечал — нигде.
# Ровно та же болезнь, что с потерянным замером: не записано в момент — значит,
# не существует.
#
# Текст берётся из транскрипта на диске, а не из окружения: полезная нагрузка
# хука `Stop` содержит `transcript_path`, а сам ответ — нет.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"

# Та же цепочка, что в log-prompt.sh. Дублируется намеренно: хуки должны
# работать поодиночке, а общий подключаемый файл — это ещё одна вещь,
# которая молча ломается, если её забыли положить рядом.
resolve_name() {
  if [ -n "${DEV_NAME:-}" ]; then printf '%s' "$DEV_NAME"; return; fi
  if [ -f "$root/.claude/dev-name" ]; then
    name=$(tr -d '[:space:]' < "$root/.claude/dev-name")
    if [ -n "$name" ]; then printf '%s' "$name"; return; fi
  fi
  name=$(git -C "$root" config user.name 2>/dev/null || true)
  if [ -n "$name" ]; then printf '%s' "$name" | tr ' ' '-'; return; fi
  printf 'unknown'
}

payload=$(cat)

# stop_hook_active — признак того, что Stop уже отработал и агент продолжил.
# Без этой проверки один ответ записывается дважды.
if [ "$(printf '%s' "$payload" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

transcript=$(printf '%s' "$payload" | jq -r '.transcript_path // empty')
[ -z "$transcript" ] || [ ! -f "$transcript" ] && exit 0

# Последний ответ агента: идём с конца, берём текстовые блоки первой
# встреченной записи assistant. `thinking` и вызовы инструментов пропускаем —
# в журнал идёт то, что человек видел на экране.
text=$(python3 - "$transcript" <<'PY' 2>/dev/null || true
import json, sys

last = None
with open(sys.argv[1], encoding='utf-8') as fh:
    for line in fh:
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if record.get('type') != 'assistant' or record.get('isSidechain'):
            continue
        blocks = record.get('message', {}).get('content', [])
        chunks = [b.get('text', '') for b in blocks if b.get('type') == 'text']
        joined = '\n'.join(c for c in chunks if c.strip())
        # Записей assistant на один ответ несколько (текст, вызовы
        # инструментов, снова текст). Держим последнюю непустую.
        if joined.strip():
            last = joined

print(last or '')
PY
)

[ -z "${text// }" ] && exit 0

who=$(resolve_name)
dir="$root/sessions/$who"
mkdir -p "$dir"
file="$dir/$(date +%Y-%m-%d).md"

if [ ! -f "$file" ]; then
  printf '# Журнал сессий — %s — %s\n' "$who" "$(date +%Y-%m-%d)" > "$file"
fi

# Хвост уже записанного: если этот же ответ туда попал, второй раз не пишем.
# Транскрипт при продолжении сессии перечитывается с начала, и без проверки
# один и тот же текст может лечь дважды.
if [ -f "$file" ] && tail -c 4000 "$file" | grep -qF "$(printf '%s' "$text" | head -c 120)"; then
  exit 0
fi

{
  printf '\n### Ответ · %s\n\n' "$(date +%H:%M:%S)"
  printf '%s\n' "$text"
} >> "$file"

exit 0
