/** Секция текстового узла. Само значение правится на холсте, здесь только стиль. */

import {
  ColorField,
  NumberField,
  Row,
  Section,
  SegmentedField,
  ToggleField,
} from '@/features/inspector/ui/controls';
import { useBoardStore } from '@/shared/store/board';
import type { TextFont, TextNode, TextStyle } from '@/shared/types/document';
import { AppearanceSection, BoxSection, TextStyleRows } from './parts';

/**
 * Гарнитуры. Ключи те же, что в модели (`TextFont`), стеки подставляет холст —
 * зона B в `features/canvas` не ходит, а хранить в документе CSS-стек нельзя:
 * на чужой машине шрифта может не быть.
 */
const FONT_OPTIONS = [
  { value: 'sans', label: 'Гротеск' },
  { value: 'serif', label: 'Антиква' },
  { value: 'mono', label: 'Моно' },
];

/** Первый цвет подложки — маркерный жёлтый: подложку чаще всего ставят как выделение. */
const DEFAULT_BACKGROUND = '#FEF3A8';

const BACKGROUND_PRESETS = ['#FEF3A8', '#C4EBD3', '#C6E2F7', '#FBC9D9', '#FFFFFF', '#111827'];

export const TextSection = ({ node }: { node: TextNode }) => {
  const updateNode = useBoardStore((s) => s.updateNode);
  const patch = (p: Partial<Omit<TextNode, 'id' | 'type'>>) => updateNode(node.id, p);
  const patchText = (p: Partial<TextStyle>) => patch({ text: { ...node.text, ...p } });

  // Пустая строка — «без подложки»: удалять поле нельзя (exactOptionalPropertyTypes),
  // и это то же соглашение, что у `dash` (см. parts.tsx).
  const background = node.text.background ?? '';

  return (
    <>
      <Section title="Текст">
        <TextStyleRows style={node.text} onPatch={patchText} />
        <Row label="Гарнитура" stack>
          <SegmentedField
            value={node.text.font ?? 'sans'}
            onChange={(font) => patchText({ font: font as TextFont })}
            options={FONT_OPTIONS}
          />
        </Row>
        <Row label="Подчёркивание">
          <ToggleField
            checked={node.text.underline ?? false}
            onChange={(underline) => patchText({ underline })}
            label="Подчёркнутый"
          />
        </Row>
        <Row label="Межстрочный">
          <NumberField
            value={node.text.lineHeight}
            onChange={(lineHeight) => patchText({ lineHeight })}
            min={0.8}
            max={3}
            step={0.1}
            placeholder="1.2"
          />
        </Row>
        <Row label="Разрядка">
          <NumberField
            value={node.text.letterSpacing}
            onChange={(letterSpacing) => patchText({ letterSpacing })}
            min={-5}
            max={40}
            step={0.5}
            placeholder="0"
          />
        </Row>
        <Row label="Ширина">
          <ToggleField
            checked={node.autoWidth}
            onChange={(autoWidth) => patch({ autoWidth })}
            label="По содержимому"
          />
        </Row>
      </Section>

      <Section title="Подложка">
        <Row label="Фон">
          <ToggleField
            checked={background !== ''}
            onChange={(on) => patchText({ background: on ? DEFAULT_BACKGROUND : '' })}
            label="Есть"
          />
        </Row>
        {background === '' ? null : (
          <Row label="Цвет">
            <ColorField
              value={background}
              onChange={(color) => patchText({ background: color })}
              presets={BACKGROUND_PRESETS}
            />
          </Row>
        )}
      </Section>

      {/* При autoWidth ширина в модели остаётся, но ни на что не влияет — гасим поле. */}
      <BoxSection node={node} onPatch={patch} widthDisabled={node.autoWidth} />

      <AppearanceSection
        opacity={node.opacity}
        locked={node.locked}
        onOpacity={(opacity) => patch({ opacity })}
        onLocked={(locked) => patch({ locked })}
      />
    </>
  );
};
