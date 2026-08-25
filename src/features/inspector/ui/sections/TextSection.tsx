/** Секция текстового узла. Само значение правится на холсте, здесь только стиль. */

import { NumberField, Row, Section, ToggleField } from '@/features/inspector/ui/controls';
import { useBoardStore } from '@/shared/store/board';
import type { TextNode, TextStyle } from '@/shared/types/document';
import { AppearanceSection, BoxSection, TextStyleRows } from './parts';

export const TextSection = ({ node }: { node: TextNode }) => {
  const updateNode = useBoardStore((s) => s.updateNode);
  const patch = (p: Partial<Omit<TextNode, 'id' | 'type'>>) => updateNode(node.id, p);
  const patchText = (p: Partial<TextStyle>) => patch({ text: { ...node.text, ...p } });

  return (
    <>
      <Section title="Текст">
        <TextStyleRows style={node.text} onPatch={patchText} />
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
        <Row label="Ширина">
          <ToggleField
            checked={node.autoWidth}
            onChange={(autoWidth) => patch({ autoWidth })}
            label="По содержимому"
          />
        </Row>
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
