/**
 * Панель инструментов холста (6.1).
 *
 * Плавающая планка поверх доски: инструменты слева, показания справа —
 * зум и число объектов набраны моноширинным, потому что это измерения,
 * а не подписи. Сам холст об этой панели ничего не знает.
 */

import {
  ArrowUpRight,
  Circle,
  createLucideIcon,
  Diamond,
  Hand,
  Hexagon,
  ImagePlus,
  type LucideIcon,
  Minus,
  MousePointer2,
  Square,
  StickyNote,
  Type,
} from 'lucide-react';
import { Popover } from 'radix-ui';
import { useImageInsert } from '@/features/canvas/tools/useImageInsert';
import type { Tool } from '@/shared/store/board';
import { useBoardStore } from '@/shared/store/board';

const Heptagon = createLucideIcon('Heptagon', [
  ['polygon', { points: '12,2 20,6 22,14 16,22 8,22 2,14 4,6', key: 'outline' }],
]);

const TOOLS: Array<{ id: Tool; label: string; hotkey: string; icon: LucideIcon }> = [
  { id: 'select', label: 'Выбор', hotkey: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Рука', hotkey: 'H', icon: Hand },
  { id: 'sticky', label: 'Стикер', hotkey: 'S', icon: StickyNote },
  { id: 'text', label: 'Текст', hotkey: 'T', icon: Type },
  { id: 'rect', label: 'Прямоугольник', hotkey: 'R', icon: Square },
  { id: 'ellipse', label: 'Эллипс', hotkey: 'O', icon: Circle },
  { id: 'diamond', label: 'Ромб', hotkey: 'D', icon: Diamond },
  { id: 'hexagon', label: 'Шестиугольник', hotkey: 'X', icon: Hexagon },
  { id: 'heptagon', label: 'Семиугольник', hotkey: '7', icon: Heptagon },
  { id: 'connector', label: 'Линия', hotkey: 'L', icon: Minus },
  { id: 'pen', label: 'Стрелка', hotkey: 'P', icon: ArrowUpRight },
];

const BTN =
  'rounded-sm px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-accent';

const QUIET = `${BTN} text-pencil hover:bg-well hover:text-ink`;

export function Toolbar() {
  const { pickFile } = useImageInsert();
  const activeTool = useBoardStore((s) => s.activeTool);
  const setTool = useBoardStore((s) => s.setTool);
  const zoom = useBoardStore((s) => s.document?.viewport.zoom ?? 1);
  const zoomToFit = useBoardStore((s) => s.zoomToFit);
  const zoomToSelection = useBoardStore((s) => s.zoomToSelection);
  const resetZoom = useBoardStore((s) => s.resetZoom);
  const zoomAt = useBoardStore((s) => s.zoomAt);
  const canvasSize = useBoardStore((s) => s.canvasSize);
  const count = useBoardStore((s) => s.document?.order.length ?? 0);

  const setZoom = (next: number) =>
    zoomAt({ x: canvasSize.width / 2, y: canvasSize.height / 2 }, next / zoom);

  return (
    <div className="absolute top-4 left-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-0.5 rounded-lg border border-rule bg-sheet p-1 shadow-pop">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => setTool(tool.id)}
          title={`${tool.label} (${tool.hotkey})`}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          className={`${BTN} ${
            activeTool === tool.id
              ? 'bg-accent text-accent-ink'
              : 'text-pencil hover:bg-well hover:text-ink'
          }`}
        >
          <tool.icon className="size-4" aria-hidden="true" />
        </button>
      ))}

      {/* Картинка не инструмент: она не «включается», а сразу открывает выбор файла. */}
      <button
        type="button"
        onClick={pickFile}
        title="Картинка (I) — или перетащите файл на холст, или Cmd+V"
        aria-label="Картинка"
        className={QUIET}
      >
        <ImagePlus className="size-4" aria-hidden="true" />
      </button>

      <span className="mx-1.5 h-5 w-px bg-rule" aria-hidden="true" />

      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" title="Масштаб и вид" className={QUIET}>
            <span className="font-mono text-faint text-micro tabular-nums">
              {Math.round(zoom * 100)}% · {count}
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-20 min-w-52 rounded-md border border-rule bg-sheet p-1 shadow-pop"
            sideOffset={6}
          >
            {[50, 100, 200].map((value) => (
              <button
                key={value}
                type="button"
                className={QUIET}
                onClick={() => setZoom(value / 100)}
              >
                {value} %
              </button>
            ))}
            <div className="my-1 h-px bg-rule" />
            <button type="button" className={QUIET} onClick={zoomToFit}>
              Вписать всё
            </button>
            <button type="button" className={QUIET} onClick={zoomToSelection}>
              Вписать выделенное
            </button>
            <button type="button" className={QUIET} onClick={resetZoom}>
              100 %
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
