/** Секция фигуры: форма, заливка, обводка, скругление, подпись. */

import { Circle, Diamond, Hexagon, Square, Squircle, Triangle } from 'lucide-react';
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SegmentedField,
} from '@/features/inspector/ui/controls';
import { useBoardStore } from '@/shared/store/board';
import type { ShapeNode, TextStyle } from '@/shared/types/document';
import { AppearanceSection, BoxSection, DashRow, LabelSection, newLabel } from './parts';

const SHAPE_OPTIONS = [
  { value: 'rect', label: 'Прямоугольник', icon: <Square size={14} /> },
  { value: 'roundRect', label: 'Со скруглением', icon: <Squircle size={14} /> },
  { value: 'ellipse', label: 'Эллипс', icon: <Circle size={14} /> },
  { value: 'triangle', label: 'Треугольник', icon: <Triangle size={14} /> },
  { value: 'diamond', label: 'Ромб', icon: <Diamond size={14} /> },
  { value: 'hexagon', label: 'Шестиугольник', icon: <Hexagon size={14} /> },
];

const FILL_PRESETS = [
  '#ffffff',
  '#f3f4f6',
  '#fde68a',
  '#bbf7d0',
  '#bfdbfe',
  '#fecaca',
  '#111111',
] as const;

export const ShapeSection = ({ node }: { node: ShapeNode }) => {
  const updateNode = useBoardStore((s) => s.updateNode);
  const patch = (p: Partial<Omit<ShapeNode, 'id' | 'type'>>) => updateNode(node.id, p);

  const patchLabel = (p: Partial<TextStyle>) => {
    if (node.label === undefined) return;
    patch({ label: { ...node.label, ...p } });
  };

  return (
    <>
      <Section title="Фигура">
        <Row label="Форма" stack>
          <SegmentedField
            value={node.shape}
            onChange={(v) => patch({ shape: v as ShapeNode['shape'] })}
            options={SHAPE_OPTIONS}
          />
        </Row>
        {node.shape === 'roundRect' && (
          <Row label="Скругление">
            <NumberField
              value={node.cornerRadius}
              onChange={(cornerRadius) => patch({ cornerRadius })}
              min={0}
              step={1}
              placeholder="8"
            />
          </Row>
        )}
      </Section>

      <BoxSection node={node} onPatch={patch} />

      <Section title="Заливка и обводка">
        <Row label="Заливка">
          <ColorField
            value={node.fill}
            onChange={(fill) => patch({ fill })}
            presets={FILL_PRESETS}
          />
        </Row>
        <Row label="Обводка">
          <ColorField value={node.stroke} onChange={(stroke) => patch({ stroke })} />
        </Row>
        <Row label="Толщина">
          {/* 0 — валидное состояние «без обводки», не пустое значение. */}
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
