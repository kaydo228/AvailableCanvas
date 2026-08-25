/**
 * Секция коннектора. Рамки у него нет — ни x/y, ни width/height:
 * ConnectorNode не наследует BaseNode, у линии только концы.
 */

import {
  ColorField,
  NumberField,
  Row,
  Section,
  SegmentedField,
} from '@/features/inspector/ui/controls';
import { useBoardStore } from '@/shared/store/board';
import type { ConnectorNode, TextStyle } from '@/shared/types/document';
import { AppearanceSection, DashRow, LabelSection, newLabel } from './parts';

const ROUTING_OPTIONS = [
  { value: 'straight', label: 'Прямая' },
  { value: 'elbow', label: 'Ступени' },
  { value: 'curve', label: 'Кривая' },
];

const CAP_OPTIONS = [
  { value: 'none', label: 'Нет' },
  { value: 'arrow', label: 'Стрелка' },
  { value: 'dot', label: 'Точка' },
];

export const ConnectorSection = ({ node }: { node: ConnectorNode }) => {
  const updateNode = useBoardStore((s) => s.updateNode);
  const patch = (p: Partial<Omit<ConnectorNode, 'id' | 'type'>>) => updateNode(node.id, p);

  const patchLabel = (p: Partial<TextStyle>) => {
    if (node.label === undefined) return;
    patch({ label: { ...node.label, ...p } });
  };

  return (
    <>
      <Section title="Коннектор">
        <Row label="Форма линии" stack>
          <SegmentedField
            value={node.routing}
            onChange={(v) => patch({ routing: v as ConnectorNode['routing'] })}
            options={ROUTING_OPTIONS}
          />
        </Row>
        <Row label="Цвет">
          <ColorField value={node.stroke} onChange={(stroke) => patch({ stroke })} />
        </Row>
        <Row label="Толщина">
          {/* 0 — валидное состояние, а не пустое поле. */}
          <NumberField
            value={node.strokeWidth}
            onChange={(strokeWidth) => patch({ strokeWidth })}
            min={0}
            max={20}
            step={1}
          />
        </Row>
        <DashRow dash={node.dash} onChange={(dash) => patch({ dash })} />
      </Section>

      <Section title="Концы">
        <Row label="Начало" stack>
          <SegmentedField
            value={node.startCap}
            onChange={(v) => patch({ startCap: v as ConnectorNode['startCap'] })}
            options={CAP_OPTIONS}
          />
        </Row>
        <Row label="Конец" stack>
          <SegmentedField
            value={node.endCap}
            onChange={(v) => patch({ endCap: v as ConnectorNode['endCap'] })}
            options={CAP_OPTIONS}
          />
        </Row>
      </Section>

      <AppearanceSection
        opacity={node.opacity}
        locked={node.locked}
        onOpacity={(opacity) => patch({ opacity })}
        onLocked={(locked) => patch({ locked })}
      />

      <LabelSection
        label={node.label}
        onPatch={patchLabel}
        onAdd={() => patch({ label: newLabel() })}
      />
    </>
  );
};
