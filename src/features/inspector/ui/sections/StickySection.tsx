/**
 * Секция стикера.
 *
 * Цвет текста отдельным полем не редактируется: он связан с заливкой, иначе
 * получится жёлтый по жёлтому. Кегль тоже не показываем — он подбирается под
 * рамку автоматически, а `text.fontSize` работает лишь верхней границей.
 */

import { STICKY_PALETTE, stickyTextColor } from '@/features/inspector/model/stickyPaletteStub';
import { Row, Section, SwatchField, ToggleField } from '@/features/inspector/ui/controls';
import { useBoardStore } from '@/shared/store/board';
import type { StickyNode, TextStyle } from '@/shared/types/document';
import { AlignRow, AppearanceSection, BoxSection } from './parts';

const SWATCHES = STICKY_PALETTE.map((color) => ({ fill: color.fill, label: color.label }));

export const StickySection = ({ node }: { node: StickyNode }) => {
  const updateNode = useBoardStore((s) => s.updateNode);
  const patch = (p: Partial<Omit<StickyNode, 'id' | 'type'>>) => updateNode(node.id, p);
  const patchText = (p: Partial<TextStyle>) => patch({ text: { ...node.text, ...p } });

  return (
    <>
      <Section title="Стикер">
        <Row label="Цвет" stack>
          <SwatchField
            value={node.fill}
            onChange={(fill) =>
              patch({ fill, text: { ...node.text, color: stickyTextColor(fill) } })
            }
            colors={SWATCHES}
          />
        </Row>
        <AlignRow align={node.text.align} onChange={(align) => patchText({ align })} />
        <Row label="Начертание">
          <ToggleField
            checked={node.text.bold ?? false}
            onChange={(bold) => patchText({ bold })}
            label="Жирный"
          />
        </Row>
      </Section>

      <BoxSection node={node} onPatch={patch} />

      <AppearanceSection
        opacity={node.opacity}
        locked={node.locked}
        onOpacity={(opacity) => patch({ opacity })}
        onLocked={(locked) => patch({ locked })}
      />
    </>
  );
};
