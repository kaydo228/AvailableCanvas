# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Prostor — бесконечная доска для диаграмм, заметок и изображений. Бэкенда нет,
данные живут в браузере. ТЗ: [docs/SPEC.md](docs/SPEC.md).

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Vite на <http://localhost:5173> |
| `npm run build` | `tsc --noEmit` + сборка |
| `npm test` | Vitest, один прогон |
| `npm run test:watch` | Vitest в watch |
| `npm run e2e` | Playwright, сам поднимает dev-сервер |
| `npm run typecheck` | только типы |
| `npm run lint` | Biome — линтер и форматтер сразу |

Один файл тестов: `npx vitest run src/features/canvas/engine/grid.test.ts`.
Один тест по имени: `npx vitest run -t 'ловит дубль в order'`.
Один сценарий Playwright: `npx playwright test e2e/smoke.spec.ts`.
Починить формат и импорты: `npx biome check . --write`.

Vitest берёт только `src/**/*.test.{ts,tsx}` — `e2e/` принадлежит Playwright,
у него свой раннер.

## Разделение зон — главное правило

Два разработчика, два непересекающихся слоя. **Свою зону не покидать.**

| | A — «Движок» | B — «Оболочка» |
|---|---|---|
| Зона | всё, что рисуется на холсте | всё, что вокруг холста |
| Модули | `features/canvas/{engine,nodes,tools,selection,connectors}` | `features/{projects,inspector,history,persistence,export}`, `shared/ui` |
| Не трогает | ничего вне `features/canvas` | ничего внутри `features/canvas` |

Перед правкой файла проверь, в чьей он зоне. Если задача требует чужой зоны —
не лезь туда, а запиши запрос в [docs/CONTRACT-REQUESTS.md](docs/CONTRACT-REQUESTS.md).

## Контракт между зонами

`src/shared/types/document.ts` (модель данных) и `src/shared/store/` (действия над
документом) — общий шов. **Меняются только парой, коммит с префиксом `contract:`.**
Не расширяй их в одиночку, даже если очень удобно: разъедется у обоих.

B вызывает действия стора, A их исполняет и рисует. `useBoardStore` — плоский
Zustand-стор поверх Immer, сгруппирован по секциям: документ, узлы, порядок слоёв,
группы, коннекторы, выделение, инструменты, вид.

## Инварианты модели

Ломать нельзя, они закреплены тестами в `src/shared/model/invariants.test.ts`:

1. Каждый `id` из `order` есть в `nodes` и наоборот — соответствие взаимно однозначное.
2. `ConnectorNode` не участвует в `groupId`.
3. У `Endpoint` задан **ровно один** из `nodeId` или `point` — никогда оба и никогда ни одного.
4. Удаление узла обязано отвязать все ссылающиеся на него `Endpoint`, подставив им
   последние вычисленные координаты в `point`.
5. `zoom` всегда в диапазоне `[0.1, 4]`.

`src/shared/model/invariants.ts` пока заглушен через `notImplemented`, поэтому
15 тестов красные — это осознанное TDD-красное, а не регресс. Не удаляй тесты,
чтобы они позеленели.

## Рендер холста — запрещённые альтернативы

- **Рендер только через `react-konva`.** DOM- и SVG-узлы на холсте не создавать.
  Единственное исключение — оверлей `<textarea>` для редактирования текста
  (`features/canvas/nodes/TextOverlay.tsx`): у Konva нет редактируемого текста,
  поэтому `<textarea>` абсолютно позиционируется поверх холста, координаты
  считаются из мировых через трансформ вьюпорта, по `blur` значение уезжает в узел.
- **Не подключать tldraw, excalidraw и подобные готовые доски** — это чужой продукт целиком.
- Состояние — Zustand + Immer, не Redux и не контекст.
- Хранение — IndexedDB через `idb`. localStorage не потянет изображения-блобы.
- Библиотеки только из [docs/TOOLING.md](docs/TOOLING.md), раздел 1. Не заменять
  на привычные аналоги, не добавлять сверх списка.

## Устройство холста

`CanvasStage` — корень: `ResizeObserver` пишет `canvasSize` в стор, `useCanvasGestures`
(@use-gesture/react) переводит колесо/трекпад/пинч в `panBy` и `zoomAt`, дальше
`GridLayer` и `NodesLayer`.

Координаты живут в двух пространствах — экранном и мировом; перевод между ними
в `engine/viewport.ts`, это единственное место, где он должен быть.
`engine/contract.ts` и `nodes/contract.ts` держат типы-контракты слоя.

`NodesLayer` разводит узлы по типам в таблицу рендереров. Новый тип узла добавляется
процедурой из скилла `canvas-node-type` — шесть шагов, пропуск любого стоит дороже,
чем кажется.

Сетка рисуется слоем с `listening={false}`: Konva не строит для него hit-канвас,
клики проваливаются сквозь неё к содержимому.

## Производительность — не оптимизируй в обратную сторону

Цель — 1000 объектов при панорамировании и зуме не ниже 50 fps (NFR-01).
В зависимостях `useMemo`/`useEffect` на горячих путях намеренно стоят **примитивы**,
а не объекты `viewport`/`size`: они пересоздаются на каждый рендер родителя и
обнулили бы мемоизацию. Там, где Biome с этим спорит, стоит `biome-ignore` с
причиной — не «чини» их автофиксом.

## Чего не трогать

`.env`, `.env.*`, `*.key`, `*.pem`, `.claude/settings.local.json`, `.npmrc` —
правятся только руками. Это же закрыто хуком `.claude/hooks/guard-secrets.sh`.

## Хуки и журнал сессий

`.claude/hooks/` подключены в `.claude/settings.json`:

- `log-prompt.sh` (`UserPromptSubmit`) — пишет каждый промпт в `sessions/$DEV_NAME/ГГГГ-ММ-ДД.md`.
- `guard-secrets.sh` / `guard-bash.sh` (`PreToolUse`) — блокируют запись в секреты,
  снос корня, форс-пуш, переключение на `main`.
- `format-file.sh` (`PostToolUse`) — прогоняет `biome check --write` по изменённому файлу.
- `gate-stop.sh` (`Stop`) — typecheck и линт; при провале не даёт закончить сессию.
  Второй подряд отказ пропускает, чтобы не зациклиться.

`gate-stop.sh` означает, что **сессия не закончится с красным линтом или типами.**
Не обходи его правкой `biome.json` — чини код.

## Процедуры

- [workflows/pre-merge.md](workflows/pre-merge.md) — чеклист перед вливанием в `main`.
- [workflows/nightly-run.md](workflows/nightly-run.md) — полная схема для крупной фичи.
- Решения и отвергнутые варианты пишутся в [docs/DECISIONS.md](docs/DECISIONS.md).
