/**
 * Общие куски секций одиночного выделения.
 *
 * Внутреннее для sections/ — наружу через index.ts не выходит. Здесь лежит то,
 * что иначе пришлось бы повторить в пяти файлах: рамка, прозрачность, замок,
 * стиль текста и подпись (она одинаковая у фигуры и коннектора).
 */

import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SegmentedField,
  SliderField,
  ToggleField,
} from '@/features/inspector/ui/controls';
import type { BoxNode, TextStyle } from '@/shared/types/document';

/** В модели opacity 0..1, в панели — проценты. Пересчёт только здесь. */
export const toPercent = (opacity: number): number => Math.round(opacity * 100);
export const fromPercent = (percent: number): number => percent / 100;

/**
 * `dash` не удаляем никогда (решено в docs/CONTRACT-REQUESTS.md): «сплошная» —
 * это `dash: []`. Писать `dash: undefined` запрещает exactOptionalPropertyTypes.
 */
export const DASH_PATTERNS = {
  solid: [] as number[],
  dotted: [2, 6] as number[],
  dashed: [12, 6] as number[],
};

export type DashKind = keyof typeof DASH_PATTERNS;

export const dashKind = (dash: number[] | undefined): DashKind => {
  if (dash === undefined || dash.length === 0) return 'solid';
  return (dash[0] ?? 0) <= 4 ? 'dotted' : 'dashed';
};

const DASH_OPTIONS = [
  { value: 'solid', label: 'Сплошная' },
  { value: 'dotted', label: 'Пунктир' },
  { value: 'dashed', label: 'Штрих' },
];

export const DashRow = ({
  dash,
  onChange,
}: {
  dash: number[] | undefined;
  onChange: (dash: number[]) => void;
}) => (
  <Row label="Линия" stack>
    <SegmentedField
      value={dashKind(dash)}
      onChange={(v) => onChange(DASH_PATTERNS[v as DashKind])}
      options={DASH_OPTIONS}
    />
  </Row>
);

type BoxPatch = { x?: number; y?: number; width?: number; height?: number; rotation?: number };

/** Рамка. У коннектора её нет — он эту секцию не рисует. */
export const BoxSection = ({
  node,
  onPatch,
  widthDisabled = false,
}: {
  node: BoxNode;
  onPatch: (patch: BoxPatch) => void;
  widthDisabled?: boolean;
}) => (
  <Section title="Положение и размер">
    <Row label="X">
      <NumberField value={node.x} onChange={(x) => onPatch({ x })} />
    </Row>
    <Row label="Y">
      <NumberField value={node.y} onChange={(y) => onPatch({ y })} />
    </Row>
    <Row label="Ширина">
      <NumberField
        value={node.width}
        onChange={(width) => onPatch({ width })}
        min={1}
        disabled={widthDisabled}
      />
    </Row>
    <Row label="Высота">
      <NumberField value={node.height} onChange={(height) => onPatch({ height })} min={1} />
    </Row>
    <Row label="Поворот">
      <NumberField
        value={node.rotation}
        onChange={(rotation) => onPatch({ rotation })}
        step={1}
        suffix="°"
      />
    </Row>
  </Section>
);

export const AppearanceSection = ({
  opacity,
  locked,
  onOpacity,
  onLocked,
}: {
  opacity: number;
  locked: boolean;
  onOpacity: (opacity: number) => void;
  onLocked: (locked: boolean) => void;
}) => (
  <Section title="Вид">
    <Row label="Прозрачность">
      <SliderField
        value={toPercent(opacity)}
        onChange={(percent) => onOpacity(fromPercent(percent))}
        min={0}
        max={100}
        step={1}
        suffix="%"
      />
    </Row>
    <Row label="Замок">
      <ToggleField checked={locked} onChange={onLocked} label="Заблокирован" />
    </Row>
  </Section>
);

export const ALIGN_OPTIONS = [
  { value: 'left', label: 'Влево', icon: <AlignLeft size={14} /> },
  { value: 'center', label: 'По центру', icon: <AlignCenter size={14} /> },
  { value: 'right', label: 'Вправо', icon: <AlignRight size={14} /> },
];

export const AlignRow = ({
  align,
  onChange,
}: {
  align: TextStyle['align'];
  onChange: (align: TextStyle['align']) => void;
}) => (
  <Row label="Выравнивание" stack>
    <SegmentedField
      value={align}
      onChange={(v) => onChange(v as TextStyle['align'])}
      options={ALIGN_OPTIONS}
    />
  </Row>
);

/**
 * Кегль, цвет, выравнивание, начертание. Самого текста здесь нет намеренно:
 * значение правится на холсте через TextOverlay, дублировать его полем в панели
 * не нужно.
 */
export const TextStyleRows = ({
  style,
  onPatch,
}: {
  style: TextStyle;
  onPatch: (patch: Partial<TextStyle>) => void;
}) => (
  <>
    <Row label="Кегль">
      <NumberField
        value={style.fontSize}
        onChange={(fontSize) => onPatch({ fontSize })}
        min={8}
        max={144}
        step={1}
      />
    </Row>
    <Row label="Цвет">
      <ColorField value={style.color} onChange={(color) => onPatch({ color })} />
    </Row>
    <AlignRow align={style.align} onChange={(align) => onPatch({ align })} />
    <Row label="Начертание">
      <ToggleField
        checked={style.bold ?? false}
        onChange={(bold) => onPatch({ bold })}
        label="Жирный"
      />
      <ToggleField
        checked={style.italic ?? false}
        onChange={(italic) => onPatch({ italic })}
        label="Курсив"
      />
    </Row>
  </>
);

/** Заготовка подписи для фигуры и коннектора: шлём целый TextStyle. */
export const newLabel = (): TextStyle => ({
  value: '',
  fontSize: 14,
  color: '#111111',
  align: 'center',
});

/** Подпись фигуры и коннектора: секция появляется, только когда label задан. */
export const LabelSection = ({
  label,
  onPatch,
  onAdd,
}: {
  label: TextStyle | undefined;
  onPatch: (patch: Partial<TextStyle>) => void;
  onAdd: () => void;
}) => (
  <Section title="Подпись">
    {label === undefined ? (
      <button
        type="button"
        onClick={onAdd}
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        Добавить подпись
      </button>
    ) : (
      <TextStyleRows style={label} onPatch={onPatch} />
    )}
  </Section>
);
