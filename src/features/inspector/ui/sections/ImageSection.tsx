/**
 * Секция картинки. blobId, naturalWidth и naturalHeight не редактируются —
 * это данные файла, а не свойства узла; исходный размер показан справкой.
 */

import { Row, Section } from '@/features/inspector/ui/controls';
import { useBoardStore } from '@/shared/store/board';
import type { ImageNode } from '@/shared/types/document';
import { AppearanceSection, BoxSection } from './parts';

export const ImageSection = ({ node }: { node: ImageNode }) => {
  const updateNode = useBoardStore((s) => s.updateNode);
  const patch = (p: Partial<Omit<ImageNode, 'id' | 'type'>>) => updateNode(node.id, p);

  return (
    <>
      <BoxSection node={node} onPatch={patch} />

      <Section title="Картинка">
        <Row label="Пропорции">
          <span className="text-sm text-neutral-500 tabular-nums">
            {node.naturalWidth} × {node.naturalHeight}
          </span>
        </Row>
      </Section>

      <AppearanceSection
        opacity={node.opacity}
        locked={node.locked}
        onOpacity={(opacity) => patch({ opacity })}
        onLocked={(locked) => patch({ locked })}
      />
    </>
  );
};
