/**
 * Множественное выделение (FR-09): только общие поля, изменение — сразу всем.
 *
 * Список полей целиком считает `commonFields` — здесь он не дополняется и не
 * фильтруется. При разнотипном выделении он сам сжимается до прозрачности и
 * замка, и это правильный ответ, а не обеднённый: остальные поля у разных
 * типов значат разное.
 *
 * Значения читаются через `sharedValue`: разошлись — в контрол уходит
 * `undefined` и он показывает плейсхолдер. Подставить значение первого узла
 * и дать молча применить его ко всем — потерянные данные.
 */

import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp } from 'lucide-react';

import { type NodePatch, useBoardStore } from '@/shared/store/board';
import type { BoxNode, Node, TextStyle } from '@/shared/types/document';

import {
  type CommonField,
  commonFields,
  idsOf,
  sharedValue,
  textStyleKey,
  textStyleOf,
} from '../model/common';
import {
  ColorField,
  NumberField,
  Row,
  Section,
  SegmentedField,
  SliderField,
  ToggleField,
} from './controls';

/** Числовое поле рамки. Коннектор сюда не доходит: 'x' и прочие есть в списке
 *  только когда рамка есть у всех. */
const boxValue = (nodes: Node[], read: (node: BoxNode) => number) =>
  sharedValue(nodes, (node) => (node.type === 'connector' ? undefined : read(node)));

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Слева' },
  { value: 'center', label: 'По центру' },
  { value: 'right', label: 'Справа' },
];

const buttonClass =
  'grid h-8 flex-1 place-items-center rounded-sm border border-rule bg-paper text-pencil transition-colors hover:border-rule-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const MultiSection = ({ nodes }: { nodes: Node[] }) => {
  const updateNodes = useBoardStore((s) => s.updateNodes);
  const bringToFront = useBoardStore((s) => s.bringToFront);
  const bringForward = useBoardStore((s) => s.bringForward);
  const sendBackward = useBoardStore((s) => s.sendBackward);
  const sendToBack = useBoardStore((s) => s.sendToBack);

  const ids = idsOf(nodes);
  const patch = (change: NodePatch) => updateNodes(ids, change);

  /*
   * Замок выключает геометрию, но не оформление: снять замок должно быть чем,
   * а «только чтение» — это уже другая функция (docs/DECISIONS.md, 2026-08-27).
   * Достаточно одного заблокированного узла: применять сдвиг ко всем, кроме
   * него, значит тихо развалить выделенную группу объектов по разным местам.
   */
  const anyLocked = nodes.some((node) => node.locked);

  /**
   * Единственное место, где одним патчем не обойтись: у фигуры стиль лежит под
   * ключом `label`, у текста и стикера — под `text`, и новое значение надо
   * смержить с существующим у каждого узла, иначе изменение размера шрифта
   * сотрёт цвет и сам текст.
   */
  const patchTextStyle = (change: Partial<TextStyle>) => {
    for (const node of nodes) {
      const key = textStyleKey(node);
      const style = textStyleOf(node);
      if (key && style) updateNodes([node.id], { [key]: { ...style, ...change } } as NodePatch);
    }
  };

  const opacity = sharedValue(nodes, (node) => node.opacity);
  /** Куда свести разъехавшуюся прозрачность: среднее — наименее произвольное. */
  const averageOpacity =
    Math.round((nodes.reduce((sum, node) => sum + node.opacity, 0) / nodes.length) * 100) / 100;
  const style = (read: (value: TextStyle) => string | number) =>
    sharedValue(nodes, (node) => {
      const value = textStyleOf(node);
      return value === undefined ? undefined : read(value);
    });

  const field = (name: CommonField) => {
    switch (name) {
      case 'x':
        return (
          <Row key={name} label="X">
            <NumberField
              value={boxValue(nodes, (n) => n.x)}
              onChange={(x) => patch({ x })}
              suffix="px"
              disabled={anyLocked}
            />
          </Row>
        );
      case 'y':
        return (
          <Row key={name} label="Y">
            <NumberField
              value={boxValue(nodes, (n) => n.y)}
              onChange={(y) => patch({ y })}
              suffix="px"
              disabled={anyLocked}
            />
          </Row>
        );
      case 'width':
        return (
          <Row key={name} label="Ширина">
            <NumberField
              value={boxValue(nodes, (n) => n.width)}
              onChange={(width) => patch({ width })}
              min={1}
              suffix="px"
              disabled={anyLocked}
            />
          </Row>
        );
      case 'height':
        return (
          <Row key={name} label="Высота">
            <NumberField
              value={boxValue(nodes, (n) => n.height)}
              onChange={(height) => patch({ height })}
              min={1}
              suffix="px"
              disabled={anyLocked}
            />
          </Row>
        );
      case 'rotation':
        return (
          <Row key={name} label="Поворот">
            <NumberField
              value={boxValue(nodes, (n) => n.rotation)}
              onChange={(rotation) => patch({ rotation })}
              suffix="°"
              disabled={anyLocked}
            />
          </Row>
        );
      case 'opacity':
        // В модели 0..1, в панели проценты.
        return (
          <Row key={name} label="Прозрачность">
            <SliderField
              value={opacity === undefined ? undefined : Math.round(opacity * 100)}
              onChange={(percent) => patch({ opacity: percent / 100 })}
              min={0}
              max={100}
              step={1}
              suffix="%"
              equalizeTo={Math.round(averageOpacity * 100)}
            />
          </Row>
        );
      case 'locked':
        return (
          <Row key={name} label="Замок">
            <ToggleField
              checked={sharedValue(nodes, (node) => node.locked)}
              onChange={(locked) => patch({ locked })}
              label="Заблокирован"
            />
          </Row>
        );
      case 'fill':
        return (
          <Row key={name} label="Заливка">
            <ColorField
              value={sharedValue(nodes, (node) => ('fill' in node ? node.fill : undefined))}
              onChange={(fill) => patch({ fill })}
              count={nodes.length}
            />
          </Row>
        );
      case 'stroke':
        return (
          <Row key={name} label="Обводка">
            <ColorField
              value={sharedValue(nodes, (node) => ('stroke' in node ? node.stroke : undefined))}
              onChange={(stroke) => patch({ stroke })}
              count={nodes.length}
            />
          </Row>
        );
      case 'strokeWidth':
        return (
          <Row key={name} label="Толщина">
            <NumberField
              value={sharedValue(nodes, (node) =>
                'strokeWidth' in node ? node.strokeWidth : undefined,
              )}
              onChange={(strokeWidth) => patch({ strokeWidth })}
              min={0}
              step={1}
              suffix="px"
            />
          </Row>
        );
      case 'textStyle':
        return (
          <div key={name} className="contents">
            <Row label="Кегль">
              <NumberField
                value={style((value) => value.fontSize) as number | undefined}
                onChange={(fontSize) => patchTextStyle({ fontSize })}
                min={1}
                suffix="px"
              />
            </Row>
            <Row label="Цвет текста">
              <ColorField
                value={style((value) => value.color) as string | undefined}
                onChange={(color) => patchTextStyle({ color })}
                count={nodes.length}
              />
            </Row>
            <Row label="Выравнивание">
              <SegmentedField
                value={style((value) => value.align) as string | undefined}
                onChange={(align) => patchTextStyle({ align: align as TextStyle['align'] })}
                options={ALIGN_OPTIONS}
              />
            </Row>
          </div>
        );
    }
  };

  return (
    <>
      <Section title={`Выделено: ${nodes.length}`}>{commonFields(nodes).map(field)}</Section>

      <Section title="Порядок">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => bringToFront(ids)}
            title="На передний план"
            className={buttonClass}
          >
            <ChevronsUp className="size-4" aria-hidden="true" />
            <span className="sr-only">На передний план</span>
          </button>
          <button
            type="button"
            onClick={() => bringForward(ids)}
            title="Вперёд"
            className={buttonClass}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
            <span className="sr-only">Вперёд</span>
          </button>
          <button
            type="button"
            onClick={() => sendBackward(ids)}
            title="Назад"
            className={buttonClass}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
            <span className="sr-only">Назад</span>
          </button>
          <button
            type="button"
            onClick={() => sendToBack(ids)}
            title="На задний план"
            className={buttonClass}
          >
            <ChevronsDown className="size-4" aria-hidden="true" />
            <span className="sr-only">На задний план</span>
          </button>
        </div>
      </Section>
    </>
  );
};
