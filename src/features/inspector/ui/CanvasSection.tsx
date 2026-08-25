/**
 * Свойства холста — то, что панель показывает при пустом выделении (FR-09).
 *
 * Панель не пустеет никогда: пустая правая колонка читается как поломка,
 * поэтому вместо неё цвет фона и сетка. Изменение применяется мгновенно,
 * кнопки «Применить» по требованию нет.
 */

import { useBoardStore } from '@/shared/store/board';
import type { BoardDocument } from '@/shared/types/document';

import { ColorField, Row, Section, SegmentedField } from './controls';

type Grid = BoardDocument['background']['grid'];

const GRID_OPTIONS: Array<{ value: Grid; label: string }> = [
  { value: 'dots', label: 'Точки' },
  { value: 'lines', label: 'Линии' },
  { value: 'none', label: 'Без сетки' },
];

export const CanvasSection = () => {
  const background = useBoardStore((s) => s.document?.background);
  const setBackground = useBoardStore((s) => s.setBackground);

  return (
    <Section title="Холст">
      <Row label="Фон">
        <ColorField value={background?.color} onChange={(color) => setBackground({ color })} />
      </Row>

      <Row label="Сетка" stack>
        <SegmentedField
          value={background?.grid}
          onChange={(grid) => setBackground({ grid: grid as Grid })}
          options={GRID_OPTIONS}
        />
      </Row>
    </Section>
  );
};
